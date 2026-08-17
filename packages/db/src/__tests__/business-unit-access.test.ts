import { randomUUID } from "node:crypto";
import type { EvaluationSnapshot } from "@plataforma-csa/sdk-core";
import { statusKey } from "@plataforma-csa/sdk-core";
import { applySetCookies } from "better-auth/cookies";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { auth } from "../auth.js";
import { db } from "../client.js";
import { createDimension, createFramework, createIndicator, createSubindicator, updateSubindicator, ValidationError } from "../domain/service.js";
import { createEvaluation } from "../domain/evaluation-service.js";
import { assignEvaluation, setExclusion } from "../domain/evaluation-assignment-service.js";
import { assertAnswersRespectExclusions, getEvaluationForBusinessUnit, isCorporateMode } from "../domain/business-unit-access.js";
import { upsertResponse } from "../domain/response-service.js";
import { organization, user } from "../schema/auth.js";
import { dimension, framework, indicator, subindicator } from "../schema/domain.js";
import { evaluation } from "../schema/evaluation.js";
import { response } from "../schema/response.js";

// VS-053 (docs/domain/business-units.md, "Acceso del evaluado"): flujo
// autenticado de la unidad de negocio contra Neon real (ver docs/RISKS.md
// R-005), mismo patrón que evaluation-assignment.test.ts.
const runId = randomUUID().slice(0, 8);
const emailFor = (label: string) => `test-bua-${runId}-${label}@example.com`;
const PASSWORD = "Sup3rSecret!23";

const createdUserIds = new Set<string>();
const createdOrgIds = new Set<string>();

// makeOrgWithOwner acepta parentOrganizationId opcional: sin él crea una
// organización raíz (matriz); con él crea una unidad de negocio hija.
async function makeOrgWithOwner(label: string, parentOrganizationId?: string) {
  const email = emailFor(label);
  const signUp = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: label } });
  createdUserIds.add(signUp.user.id);

  const signIn = await auth.api.signInEmail({ body: { email, password: PASSWORD }, returnHeaders: true });
  const headers = new Headers();
  applySetCookies(headers, signIn.headers.getSetCookie());

  const org = await auth.api.createOrganization({
    body: {
      name: `Org ${label} ${runId}`,
      slug: `org-bua-${label}-${runId}`,
      ...(parentOrganizationId ? { parentOrganizationId } : {}),
    },
    headers,
  });
  createdOrgIds.add(org!.id);

  return { organizationId: org!.id };
}

// Matriz + unidad de negocio con un Framework → Dimensión → Indicador →
// Subindicador (3 elementos en su formSchema), publicada y asignada a la
// unidad. La unidad devuelta está lista para el flujo de VS-053.
async function setupCorporateEvaluation(label: string) {
  const { organizationId: matriz } = await makeOrgWithOwner(label);
  const { organizationId: unidad } = await makeOrgWithOwner(`${label}-unidad`, matriz);

  const fw = await createFramework(matriz, { name: `Framework ${label}` });
  const dim = await createDimension(matriz, { frameworkId: fw.id, title: "Dim" });
  const ind = await createIndicator(matriz, { dimensionId: dim.id, title: "Ind" });
  const sub = await createSubindicator(matriz, { indicatorId: ind.id, title: "Sub" });
  await updateSubindicator(matriz, sub.id, {
    formSchema: {
      schemaVersion: 1,
      elements: [
        { id: "el-1", type: "texto_corto", label: "Campo 1" },
        { id: "el-2", type: "texto_corto", label: "Campo 2" },
        { id: "el-3", type: "numero", label: "Campo 3" },
      ],
    },
  });

  const ev = await createEvaluation(matriz, { frameworkId: fw.id });
  const assignment = await assignEvaluation(matriz, ev.id, { businessUnitOrganizationId: unidad });

  return { matriz, unidad, ev, assignment, subindicatorId: sub.id };
}

// Busca un Subindicador dentro del snapshot (bajo Indicador o directo bajo
// Dimensión, VS-029 — mismo recorrido que snapshotHasSubindicator).
function snapshotSubindicator(snapshot: EvaluationSnapshot, subindicatorId: string) {
  for (const dim of snapshot.dimensions) {
    for (const ind of dim.indicators) {
      const found = ind.subindicators.find((s) => s.id === subindicatorId);
      if (found) return found;
    }
    const direct = dim.subindicators.find((s) => s.id === subindicatorId);
    if (direct) return direct;
  }
  throw new Error("subindicator no encontrado en el snapshot");
}

function snapshotElementIds(snapshot: EvaluationSnapshot, subindicatorId: string): string[] {
  const sub = snapshotSubindicator(snapshot, subindicatorId);
  return sub.formSchema?.elements.map((el) => el.id) ?? [];
}

afterAll(async () => {
  await Promise.all(
    Array.from(createdOrgIds).map(async (organizationId) => {
      await db.delete(response).where(eq(response.businessUnitOrganizationId, organizationId));
      await db.delete(evaluation).where(eq(evaluation.organizationId, organizationId));
      await db.delete(subindicator).where(eq(subindicator.organizationId, organizationId));
      await db.delete(indicator).where(eq(indicator.organizationId, organizationId));
      await db.delete(dimension).where(eq(dimension.organizationId, organizationId));
      await db.delete(framework).where(eq(framework.organizationId, organizationId));
    }),
  );
  // Las unidades de negocio (parentOrganizationId no nulo) se borran antes
  // que sus matrices para no depender del orden de la cascada.
  const orgs = await db
    .select({ id: organization.id, parentOrganizationId: organization.parentOrganizationId })
    .from(organization);
  const byId = new Map(orgs.map((o) => [o.id, o]));
  const children = Array.from(createdOrgIds).filter((id) => byId.get(id)?.parentOrganizationId);
  const roots = Array.from(createdOrgIds).filter((id) => !byId.get(id)?.parentOrganizationId);
  await Promise.all(children.map((id) => db.delete(organization).where(eq(organization.id, id))));
  await Promise.all(roots.map((id) => db.delete(organization).where(eq(organization.id, id))));
  await Promise.all(Array.from(createdUserIds).map((userId) => db.delete(user).where(eq(user.id, userId))));
}, 60000);

describe("VS-053 — acceso del evaluado por unidad de negocio (contra Neon real)", () => {
  it("isCorporateMode es false mientras la Evaluación no tiene asignaciones", async () => {
    const { organizationId } = await makeOrgWithOwner("mode-false");
    const fw = await createFramework(organizationId, { name: "Framework Mode False" });
    const ev = await createEvaluation(organizationId, { frameworkId: fw.id });

    expect(await isCorporateMode(ev.id)).toBe(false);
  });

  it("isCorporateMode es true en cuanto hay una asignación de unidad de negocio", async () => {
    const { organizationId: matriz } = await makeOrgWithOwner("mode-true");
    const { organizationId: unidad } = await makeOrgWithOwner("mode-true-unidad", matriz);
    const fw = await createFramework(matriz, { name: "Framework Mode True" });
    const ev = await createEvaluation(matriz, { frameworkId: fw.id });

    expect(await isCorporateMode(ev.id)).toBe(false);
    await assignEvaluation(matriz, ev.id, { businessUnitOrganizationId: unidad });
    expect(await isCorporateMode(ev.id)).toBe(true);
  });

  it("getEvaluationForBusinessUnit devuelve el snapshot completo sin exclusiones", async () => {
    const { unidad, ev, subindicatorId } = await setupCorporateEvaluation("access-plain");

    const result = await getEvaluationForBusinessUnit(ev.id, unidad);
    const snapshot = result.snapshot as EvaluationSnapshot;
    expect(snapshotElementIds(snapshot, subindicatorId)).toEqual(["el-1", "el-2", "el-3"]);
  });

  it("filtra del snapshot el elemento excluido puntualmente", async () => {
    const { matriz, unidad, ev, assignment, subindicatorId } = await setupCorporateEvaluation("access-element");
    await setExclusion(matriz, ev.id, assignment.id, { subindicatorId, elementId: "el-2" });

    const result = await getEvaluationForBusinessUnit(ev.id, unidad);
    const snapshot = result.snapshot as EvaluationSnapshot;
    expect(snapshotElementIds(snapshot, subindicatorId)).toEqual(["el-1", "el-3"]);
  });

  it("vacía elements cuando el Subindicador completo está excluido (elementId null)", async () => {
    const { matriz, unidad, ev, assignment, subindicatorId } = await setupCorporateEvaluation("access-full");
    await setExclusion(matriz, ev.id, assignment.id, { subindicatorId, elementId: null });

    const result = await getEvaluationForBusinessUnit(ev.id, unidad);
    const snapshot = result.snapshot as EvaluationSnapshot;
    const sub = snapshotSubindicator(snapshot, subindicatorId);
    // El nodo SIGUE apareciendo en el árbol (numeración estable), solo vacío.
    expect(sub.formSchema?.elements).toEqual([]);
  });

  it("assertAnswersRespectExclusions acepta respuestas a elementos no excluidos", async () => {
    const { unidad, ev, subindicatorId } = await setupCorporateEvaluation("assert-ok");

    await expect(
      assertAnswersRespectExclusions(ev.id, subindicatorId, unidad, { "el-1": "valor" }),
    ).resolves.toBeUndefined();
  });

  it("assertAnswersRespectExclusions rechaza una respuesta a un elemento excluido", async () => {
    const { matriz, unidad, ev, assignment, subindicatorId } = await setupCorporateEvaluation("assert-element");
    await setExclusion(matriz, ev.id, assignment.id, { subindicatorId, elementId: "el-2" });

    // Clave directa (elementId) y clave sintética de estado (elementId::status)
    // — ambas deben mapear al mismo elemento excluido.
    await expect(
      assertAnswersRespectExclusions(ev.id, subindicatorId, unidad, { "el-2": "no debería poder" }),
    ).rejects.toThrow(new ValidationError("ANSWER_TO_EXCLUDED_ELEMENT"));
    await expect(
      assertAnswersRespectExclusions(ev.id, subindicatorId, unidad, { [statusKey("el-2")]: "completed" }),
    ).rejects.toThrow(new ValidationError("ANSWER_TO_EXCLUDED_ELEMENT"));
  });

  it("assertAnswersRespectExclusions rechaza cualquier respuesta a un Subindicador excluido completo", async () => {
    const { matriz, unidad, ev, assignment, subindicatorId } = await setupCorporateEvaluation("assert-sub");
    await setExclusion(matriz, ev.id, assignment.id, { subindicatorId, elementId: null });

    await expect(
      assertAnswersRespectExclusions(ev.id, subindicatorId, unidad, { "el-1": "valor" }),
    ).rejects.toThrow(new ValidationError("ANSWER_TO_EXCLUDED_SUBINDICATOR"));
    // answers vacío no se rechaza (no toca ningún elemento excluido).
    await expect(
      assertAnswersRespectExclusions(ev.id, subindicatorId, unidad, {}),
    ).resolves.toBeUndefined();
  });

  it("flujo completo: guarda respuesta válida y rechaza la del elemento excluido", async () => {
    const { matriz, unidad, ev, assignment, subindicatorId } = await setupCorporateEvaluation("access-flow");
    await setExclusion(matriz, ev.id, assignment.id, { subindicatorId, elementId: "el-2" });

    // Respuesta válida: pasa la validación de exclusiones y persiste para la unidad.
    await assertAnswersRespectExclusions(ev.id, subindicatorId, unidad, { "el-1": "respuesta válida" });
    const saved = await upsertResponse(ev.id, subindicatorId, { "el-1": "respuesta válida" }, unidad);
    expect(saved.answers).toEqual({ "el-1": "respuesta válida" });
    expect(saved.businessUnitOrganizationId).toBe(unidad);

    // Respuesta al elemento excluido: bloqueada antes de llegar a persistir.
    await expect(
      assertAnswersRespectExclusions(ev.id, subindicatorId, unidad, { "el-2": "no debería guardarse" }),
    ).rejects.toThrow(new ValidationError("ANSWER_TO_EXCLUDED_ELEMENT"));
  });
});
  it("getEvaluationForBusinessUnit rechaza acceso de unidad A a Evaluación asignada a unidad B", async () => {
    const { organizationId: matriz } = await makeOrgWithOwner("cross-tenant");
    const { organizationId: unidadA } = await makeOrgWithOwner("cross-tenant-A", matriz);
    const { organizationId: unidadB } = await makeOrgWithOwner("cross-tenant-B", matriz);

    const fw = await createFramework(matriz, { name: "Framework Cross Tenant" });
    const ev = await createEvaluation(matriz, { frameworkId: fw.id });
    
    // Asignar la evaluación SOLO a unidad B
    await assignEvaluation(matriz, ev.id, { businessUnitOrganizationId: unidadB });

    // Unidad B puede acceder
    const resultB = await getEvaluationForBusinessUnit(ev.id, unidadB);
    expect(resultB.id).toBe(ev.id);

    // Unidad A NO puede acceder (403 - assignment not found)
    await expect(getEvaluationForBusinessUnit(ev.id, unidadA)).rejects.toThrow();
  });

  it("assertAnswersRespectExclusions rechaza que unidad A envíe respuestas a Evaluación asignada a unidad B", async () => {
    const { organizationId: matriz } = await makeOrgWithOwner("cross-tenant-write");
    const { organizationId: unidadA } = await makeOrgWithOwner("cross-tenant-write-A", matriz);
    const { organizationId: unidadB } = await makeOrgWithOwner("cross-tenant-write-B", matriz);

    const fw = await createFramework(matriz, { name: "Framework Cross Tenant Write" });
    const dim = await createDimension(matriz, { frameworkId: fw.id, title: "Dim" });
    const ind = await createIndicator(matriz, { dimensionId: dim.id, title: "Ind" });
    const sub = await createSubindicator(matriz, { indicatorId: ind.id, title: "Sub" });
    await updateSubindicator(matriz, sub.id, {
      formSchema: {
        schemaVersion: 1,
        elements: [{ id: "el-1", type: "texto_corto", label: "Campo 1" }],
      },
    });

    const ev = await createEvaluation(matriz, { frameworkId: fw.id });
    
    // Asignar la evaluación SOLO a unidad B
    await assignEvaluation(matriz, ev.id, { businessUnitOrganizationId: unidadB });

    // Unidad B puede escribir
    await expect(
      assertAnswersRespectExclusions(ev.id, sub.id, unidadB, { "el-1": "respuesta válida" })
    ).resolves.toBeUndefined();

    // Unidad A NO puede escribir (lanza NotFoundError "evaluation_assignment")
    await expect(
      assertAnswersRespectExclusions(ev.id, sub.id, unidadA, { "el-1": "intento de intrusión" })
    ).rejects.toThrow();
  });
