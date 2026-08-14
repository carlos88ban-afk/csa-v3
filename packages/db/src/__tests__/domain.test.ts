import { randomUUID } from "node:crypto";
import { applySetCookies } from "better-auth/cookies";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { auth } from "../auth.js";
import { AuthzError, requireActiveMember, requireWriteAccess } from "../authz.js";
import { db } from "../client.js";
import {
  createDimension,
  createFramework,
  createIndicator,
  createSubindicator,
  deleteFramework,
  getDimension,
  getFramework,
  getIndicator,
  getSubindicator,
  listDimensions,
  listDirectSubindicators,
  listFrameworks,
  NotFoundError,
  updateFramework,
  updateSubindicator,
} from "../domain/service.js";
import { member, organization, user } from "../schema/auth.js";
import { dimension, framework, indicator, subindicator } from "../schema/domain.js";

// Contra Neon real (ver docs/RISKS.md R-005) — cada dato usa un runId único
// y se limpia en afterAll.
const runId = randomUUID().slice(0, 8);
const emailFor = (label: string) => `test-${runId}-${label}@example.com`;
const PASSWORD = "Sup3rSecret!23";

const createdUserIds = new Set<string>();
const createdOrgIds = new Set<string>();

async function makeOrgWithOwner(label: string) {
  const email = emailFor(label);
  const signUp = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: label } });
  createdUserIds.add(signUp.user.id);

  const signIn = await auth.api.signInEmail({ body: { email, password: PASSWORD }, returnHeaders: true });
  const headers = new Headers();
  applySetCookies(headers, signIn.headers.getSetCookie());

  const org = await auth.api.createOrganization({
    body: { name: `Org ${label} ${runId}`, slug: `org-${label}-${runId}` },
    headers,
  });
  createdOrgIds.add(org!.id);

  return { organizationId: org!.id, userId: signUp.user.id, headers };
}

afterAll(async () => {
  for (const organizationId of createdOrgIds) {
    await db.delete(subindicator).where(eq(subindicator.organizationId, organizationId));
    await db.delete(indicator).where(eq(indicator.organizationId, organizationId));
    await db.delete(dimension).where(eq(dimension.organizationId, organizationId));
    await db.delete(framework).where(eq(framework.organizationId, organizationId));
    await db.delete(organization).where(eq(organization.id, organizationId));
  }
  for (const userId of createdUserIds) {
    await db.delete(user).where(eq(user.id, userId));
  }
});

describe("VS-004 — dominio core (Framework→Dimensión→Indicador→Subindicador)", () => {
  it("CRUD completo de Framework", async () => {
    const { organizationId } = await makeOrgWithOwner("fw-crud");

    const created = await createFramework(organizationId, { name: "Framework A" });
    expect(created.name).toBe("Framework A");

    const fetched = await getFramework(organizationId, created.id);
    expect(fetched?.id).toBe(created.id);

    const list = await listFrameworks(organizationId);
    expect(list.some((f) => f.id === created.id)).toBe(true);

    const updated = await updateFramework(organizationId, created.id, { name: "Framework A actualizado" });
    expect(updated?.name).toBe("Framework A actualizado");

    const deleted = await deleteFramework(organizationId, created.id);
    expect(deleted?.id).toBe(created.id);
    expect(await getFramework(organizationId, created.id)).toBeNull();
  });

  it("VS-034/035 — listFrameworks/listDimensions traen conteos reales (dimensionCount/indicatorCount/directSubindicatorCount)", async () => {
    const { organizationId } = await makeOrgWithOwner("counts");

    const fw = await createFramework(organizationId, { name: "Framework Conteos" });
    const dimA = await createDimension(organizationId, { frameworkId: fw.id, title: "Dim A (2 indicadores, 1 sub directo)" });
    const dimB = await createDimension(organizationId, { frameworkId: fw.id, title: "Dim B (vacía)" });

    await createIndicator(organizationId, { dimensionId: dimA.id, title: "Ind 1" });
    await createIndicator(organizationId, { dimensionId: dimA.id, title: "Ind 2" });
    await createSubindicator(organizationId, { dimensionId: dimA.id, title: "Sub directo" });

    const frameworks = await listFrameworks(organizationId);
    const listedFw = frameworks.find((f) => f.id === fw.id);
    // El join de dimension no debe inflar el conteo aunque cada dimensión
    // tenga a su vez indicadores/subs unidos por otras queries — acá solo
    // se cuentan las 2 dimensiones directas del framework.
    expect(listedFw?.dimensionCount).toBe(2);

    const dimensions = await listDimensions(organizationId, fw.id);
    const listedDimA = dimensions.find((d) => d.id === dimA.id);
    const listedDimB = dimensions.find((d) => d.id === dimB.id);
    // Caso crítico: el doble join (indicator + subindicator a la vez) no debe
    // multiplicar el conteo del otro — 2 indicadores x 1 sub directo daría 2
    // filas unidas si no fuera COUNT(DISTINCT ...) por columna.
    expect(listedDimA?.indicatorCount).toBe(2);
    expect(listedDimA?.directSubindicatorCount).toBe(1);
    expect(listedDimB?.indicatorCount).toBe(0);
    expect(listedDimB?.directSubindicatorCount).toBe(0);
  });

  it("crea la jerarquía completa Dimensión→Indicador→Subindicador y hace cascada al borrar el Framework", async () => {
    const { organizationId } = await makeOrgWithOwner("hierarchy");

    const fw = await createFramework(organizationId, { name: "Framework Jerarquía" });
    const dim = await createDimension(organizationId, { frameworkId: fw.id, title: "Dimensión 1" });
    const ind = await createIndicator(organizationId, { dimensionId: dim.id, title: "Indicador 1" });
    const sub = await createSubindicator(organizationId, { indicatorId: ind.id, title: "Subindicador 1" });

    expect(sub.revisionNumber).toBe(1);
    expect(sub.formSchema).toBeNull();

    await deleteFramework(organizationId, fw.id);

    expect(await getDimension(organizationId, dim.id)).toBeNull();
    expect(await getIndicator(organizationId, ind.id)).toBeNull();
    expect(await getSubindicator(organizationId, sub.id)).toBeNull();
  });

  it("VS-029 — crea un Subindicador directo bajo Dimensión (sin Indicador) y hace cascada al borrar la Dimensión", async () => {
    const { organizationId } = await makeOrgWithOwner("direct-sub");

    const fw = await createFramework(organizationId, { name: "Framework Directo" });
    const dim = await createDimension(organizationId, { frameworkId: fw.id, title: "Dim 0" });
    const sub = await createSubindicator(organizationId, { dimensionId: dim.id, title: "Sub directo 0.1" });

    expect(sub.indicatorId).toBeNull();
    expect(sub.dimensionId).toBe(dim.id);

    const listed = await listDirectSubindicators(organizationId, dim.id);
    expect(listed.some((s) => s.id === sub.id)).toBe(true);

    await deleteFramework(organizationId, fw.id);
    expect(await getSubindicator(organizationId, sub.id)).toBeNull();
  });

  it("VS-029 — rechaza crear un Subindicador sin indicatorId ni dimensionId, y con ambos a la vez", async () => {
    const { organizationId } = await makeOrgWithOwner("direct-sub-xor");
    const fw = await createFramework(organizationId, { name: "Framework XOR" });
    const dim = await createDimension(organizationId, { frameworkId: fw.id, title: "Dim" });
    const ind = await createIndicator(organizationId, { dimensionId: dim.id, title: "Ind" });

    // Sin indicatorId ni dimensionId: el tipo lo permite (ambos opcionales,
    // la validación XOR de createSubindicatorInput es un superRefine de
    // zod, no afecta el tipo TS estático) — el CHECK de packages/db es la
    // última línea de defensa si algo se cuela sin pasar por
    // createSubindicatorInput.parse (sdk-core) en el borde de la API.
    await expect(createSubindicator(organizationId, { title: "Sin padre" })).rejects.toThrow();

    await expect(
      createSubindicator(organizationId, { indicatorId: ind.id, dimensionId: dim.id, title: "Ambos padres" }),
    ).rejects.toThrow();
  });

  it("no se puede crear un hijo referenciando un padre de otra organización", async () => {
    const { organizationId: orgA } = await makeOrgWithOwner("cross-a");
    const { organizationId: orgB } = await makeOrgWithOwner("cross-b");

    const fwInA = await createFramework(orgA, { name: "Framework Org A" });

    await expect(
      createDimension(orgB, { frameworkId: fwInA.id, title: "Intento cruzado" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("tenant-scoping: un framework de una organización es invisible e inmutable desde otra", async () => {
    const { organizationId: orgA } = await makeOrgWithOwner("scope-a");
    const { organizationId: orgB } = await makeOrgWithOwner("scope-b");

    const fw = await createFramework(orgA, { name: "Solo visible en A" });

    expect(await getFramework(orgB, fw.id)).toBeNull();
    expect((await listFrameworks(orgB)).some((f) => f.id === fw.id)).toBe(false);
    expect(await updateFramework(orgB, fw.id, { name: "hackeado-desde-orgB" })).toBeNull();
    expect(await deleteFramework(orgB, fw.id)).toBeNull();

    // Sigue intacto en su organización real.
    const stillThere = await getFramework(orgA, fw.id);
    expect(stillThere?.name).toBe("Solo visible en A");
  });

  it("actualizar formSchema de un Subindicador incrementa revisionNumber; actualizar solo title no lo hace", async () => {
    const { organizationId } = await makeOrgWithOwner("revision");

    const fw = await createFramework(organizationId, { name: "FW Revision" });
    const dim = await createDimension(organizationId, { frameworkId: fw.id, title: "Dim" });
    const ind = await createIndicator(organizationId, { dimensionId: dim.id, title: "Ind" });
    const sub = await createSubindicator(organizationId, { indicatorId: ind.id, title: "Sub" });
    expect(sub.revisionNumber).toBe(1);

    const afterTitleOnly = await updateSubindicator(organizationId, sub.id, { title: "Sub renombrado" });
    expect(afterTitleOnly?.revisionNumber).toBe(1);

    const afterFormSchema = await updateSubindicator(organizationId, sub.id, {
      formSchema: {
        schemaVersion: 1,
        elements: [
          { id: "el-1", type: "instruccion", label: "Lea con atención antes de responder" },
          { id: "el-2", type: "texto_corto", label: "Nombre de la empresa", required: true },
        ],
      },
    });
    expect(afterFormSchema?.revisionNumber).toBe(2);
    expect(afterFormSchema?.formSchema).toMatchObject({ schemaVersion: 1 });
  });

  it("requireActiveMember rechaza sesiones no autenticadas y usuarios sin organización activa", async () => {
    await expect(requireActiveMember(new Headers())).rejects.toThrow(AuthzError);

    const email = emailFor("no-org");
    const signUp = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: "Sin Org" } });
    createdUserIds.add(signUp.user.id);
    const signIn = await auth.api.signInEmail({ body: { email, password: PASSWORD }, returnHeaders: true });
    const headers = new Headers();
    applySetCookies(headers, signIn.headers.getSetCookie());

    // Este usuario nunca creó ni se unió a una organización → sin sesión activa.
    await expect(requireActiveMember(headers)).rejects.toThrow(AuthzError);
  });

  it("requireWriteAccess (VS-014) exige owner/editor; evaluador queda en solo lectura", async () => {
    const { organizationId, headers: ownerHeaders } = await makeOrgWithOwner("perm-owner");

    async function addMemberWithRole(label: string, role: string) {
      const email = emailFor(label);
      const signUp = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: label } });
      createdUserIds.add(signUp.user.id);
      const signIn = await auth.api.signInEmail({ body: { email, password: PASSWORD }, returnHeaders: true });
      const headers = new Headers();
      applySetCookies(headers, signIn.headers.getSetCookie());
      await db.insert(member).values({ id: randomUUID(), organizationId, userId: signUp.user.id, role, createdAt: new Date() });
      await auth.api.setActiveOrganization({ headers, body: { organizationId } });
      return headers;
    }

    const editorHeaders = await addMemberWithRole("perm-editor", "editor");
    const evaluadorHeaders = await addMemberWithRole("perm-evaluador", "evaluador");

    await expect(requireWriteAccess(ownerHeaders)).resolves.toMatchObject({ organizationId, role: "owner" });
    await expect(requireWriteAccess(editorHeaders)).resolves.toMatchObject({ organizationId, role: "editor" });
    await expect(requireWriteAccess(evaluadorHeaders)).rejects.toThrow(AuthzError);

    // Lectura sigue permitida para los tres roles, incluido evaluador.
    await expect(requireActiveMember(evaluadorHeaders)).resolves.toMatchObject({ role: "evaluador" });
  });
});
