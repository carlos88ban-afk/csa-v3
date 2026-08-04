import { randomUUID } from "node:crypto";
import { applySetCookies } from "better-auth/cookies";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { auth } from "../auth.js";
import { AuthzError, requireActiveMember } from "../authz.js";
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
  listFrameworks,
  NotFoundError,
  updateFramework,
  updateSubindicator,
} from "../domain/service.js";
import { organization, user } from "../schema/auth.js";
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
      formSchema: { elements: [] },
    });
    expect(afterFormSchema?.revisionNumber).toBe(2);
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
});
