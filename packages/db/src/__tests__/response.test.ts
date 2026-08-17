import { randomUUID } from "node:crypto";
import { applySetCookies } from "better-auth/cookies";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { auth } from "../auth.js";
import { db } from "../client.js";
import { createEvaluation, deleteEvaluation } from "../domain/evaluation-service.js";
import { createDimension, createFramework, createIndicator, createSubindicator, updateSubindicator } from "../domain/service.js";
import { getResponse, listResponses, setElementStatus, upsertResponse } from "../domain/response-service.js";
import { EvaluationLockedError } from "../domain/service.js";
import { organization, user } from "../schema/auth.js";
import { dimension, framework, indicator, subindicator } from "../schema/domain.js";
import { evaluation } from "../schema/evaluation.js";
import { response } from "../schema/response.js";

// Contra Neon real (ver docs/RISKS.md R-005) — cada dato usa un runId único
// y se limpia en afterAll.
const runId = randomUUID().slice(0, 8);
const emailFor = (label: string) => `test-resp-${runId}-${label}@example.com`;
const PASSWORD = "Sup3rSecret!23";

const createdUserIds = new Set<string>();
const createdOrgIds = new Set<string>();

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
      slug: `org-resp-${label}-${runId}`,
      ...(parentOrganizationId ? { parentOrganizationId } : {}),
    },
    headers,
  });
  createdOrgIds.add(org!.id);

  return { organizationId: org!.id };
}

async function publishedEvaluationWithSubindicator(label: string) {
  const { organizationId } = await makeOrgWithOwner(label);
  const fw = await createFramework(organizationId, { name: `Framework ${label}` });
  const dim = await createDimension(organizationId, { frameworkId: fw.id, title: "Dim" });
  const ind = await createIndicator(organizationId, { dimensionId: dim.id, title: "Ind" });
  const sub = await createSubindicator(organizationId, { indicatorId: ind.id, title: "Sub" });
  await updateSubindicator(organizationId, sub.id, {
    formSchema: { schemaVersion: 1, elements: [{ id: "el-1", type: "texto_corto", label: "Nombre" }] },
  });
  const ev = await createEvaluation(organizationId, { frameworkId: fw.id });
  return { organizationId, ev, subindicatorId: sub.id };
}

// Subindicadores directos bajo Dimensión (VS-029, docs/domain/evaluation-hierarchy.md).
async function publishedEvaluationWithDirectSubindicator(label: string) {
  const { organizationId } = await makeOrgWithOwner(label);
  const fw = await createFramework(organizationId, { name: `Framework ${label}` });
  const dim = await createDimension(organizationId, { frameworkId: fw.id, title: "Dim" });
  const sub = await createSubindicator(organizationId, { dimensionId: dim.id, title: "Sub directo" });
  await updateSubindicator(organizationId, sub.id, {
    formSchema: { schemaVersion: 1, elements: [{ id: "el-1", type: "texto_corto", label: "Nombre" }] },
  });
  const ev = await createEvaluation(organizationId, { frameworkId: fw.id });
  return { organizationId, ev, subindicatorId: sub.id };
}

afterAll(async () => {
  for (const organizationId of createdOrgIds) {
    await db.delete(evaluation).where(eq(evaluation.organizationId, organizationId));
    await db.delete(subindicator).where(eq(subindicator.organizationId, organizationId));
    await db.delete(indicator).where(eq(indicator.organizationId, organizationId));
    await db.delete(dimension).where(eq(dimension.organizationId, organizationId));
    await db.delete(framework).where(eq(framework.organizationId, organizationId));
    await db.delete(organization).where(eq(organization.id, organizationId));
  }
  for (const userId of createdUserIds) {
    await db.delete(user).where(eq(user.id, userId));
  }
}, 60000);

describe("VS-010 — engine/persistence (contra Neon real)", () => {
  it("upsertResponse crea y luego actualiza sin duplicar fila", async () => {
    const { ev, subindicatorId } = await publishedEvaluationWithSubindicator("upsert");

    const created = await upsertResponse(ev.id, subindicatorId, { "el-1": "Primera respuesta" });
    expect(created.answers).toEqual({ "el-1": "Primera respuesta" });

    const updated = await upsertResponse(ev.id, subindicatorId, { "el-1": "Respuesta corregida" });
    expect(updated.id).toBe(created.id);
    expect(updated.answers).toEqual({ "el-1": "Respuesta corregida" });

    const all = await listResponses(ev.id);
    expect(all).toHaveLength(1);
    expect(all[0]!.answers).toEqual({ "el-1": "Respuesta corregida" });
  });

  it("rechaza un subindicatorId que no pertenece al snapshot de la Evaluación", async () => {
    const { ev } = await publishedEvaluationWithSubindicator("ajeno");

    await expect(upsertResponse(ev.id, "subindicator-que-no-existe", { "el-1": "x" })).rejects.toThrow(
      "subindicator_NOT_FOUND",
    );
  });

  it("VS-029 — upsertResponse acepta un Subindicador directo bajo Dimensión (sin Indicador intermedio)", async () => {
    // Bug real encontrado en producción durante la verificación de VS-029:
    // snapshotHasSubindicator solo miraba dim.indicators[].subindicators, no
    // dim.subindicators (directos) — guardar una respuesta de un
    // Subindicador directo fallaba con subindicator_NOT_FOUND.
    const { ev, subindicatorId } = await publishedEvaluationWithDirectSubindicator("directo");

    const created = await upsertResponse(ev.id, subindicatorId, { "el-1": "Respuesta en subindicador directo" });
    expect(created.answers).toEqual({ "el-1": "Respuesta en subindicador directo" });
  });

  it("borrar la Evaluación borra en cascada sus Respuestas", async () => {
    const { organizationId, ev, subindicatorId } = await publishedEvaluationWithSubindicator("cascade");

    await upsertResponse(ev.id, subindicatorId, { "el-1": "algo" });
    expect(await listResponses(ev.id)).toHaveLength(1);

    await deleteEvaluation(organizationId, ev.id);

    const remaining = await db.select().from(response).where(eq(response.evaluationId, ev.id));
    expect(remaining).toHaveLength(0);
  });

  it("persiste y recupera refs de evidencia dentro de answers", async () => {
    const { ev, subindicatorId } = await publishedEvaluationWithSubindicator("evidencia");

    const refs = [
      { key: `evaluations/${ev.id}/archivo-abc`, name: "reporte.pdf", size: 2048, mimeType: "application/pdf" },
    ];
    await upsertResponse(ev.id, subindicatorId, { "el-1": refs });

    const all = await listResponses(ev.id);
    expect(all).toHaveLength(1);
    expect(all[0]!.answers).toEqual({ "el-1": refs });
  });

  it("getResponse devuelve null si no hay Respuesta todavía, y la fila una vez creada", async () => {
    const { ev, subindicatorId } = await publishedEvaluationWithSubindicator("get-response");

    expect(await getResponse(ev.id, subindicatorId)).toBeNull();

    await upsertResponse(ev.id, subindicatorId, { "el-1": "algo" });
    const row = await getResponse(ev.id, subindicatorId);
    expect(row?.answers).toEqual({ "el-1": "algo" });
  });

  it("setElementStatus (VS-018) escribe la clave sintética ::status sin pisar el resto de answers, y null la borra", async () => {
    const { ev, subindicatorId } = await publishedEvaluationWithSubindicator("status");

    await upsertResponse(ev.id, subindicatorId, { "el-1": "una respuesta" });

    const approved = await setElementStatus(ev.id, subindicatorId, "el-1", "approved");
    expect(approved.answers).toEqual({ "el-1": "una respuesta", "el-1::status": "approved" });

    const submitted = await setElementStatus(ev.id, subindicatorId, "el-1", "submitted");
    expect(submitted.answers).toEqual({ "el-1": "una respuesta", "el-1::status": "submitted" });

    const reverted = await setElementStatus(ev.id, subindicatorId, "el-1", null);
    expect(reverted.answers).toEqual({ "el-1": "una respuesta" });
  });

  describe("VS-051 — partición de response por unidad de negocio (docs/domain/business-units.md)", () => {
    it("sin unidad indicada, la fila queda en evaluation.organizationId (flujo público sin cambios)", async () => {
      const { organizationId, ev, subindicatorId } = await publishedEvaluationWithSubindicator("unidad-default");

      const created = await upsertResponse(ev.id, subindicatorId, { "el-1": "público" });
      expect(created.businessUnitOrganizationId).toBe(organizationId);

      const all = await listResponses(ev.id);
      expect(all).toHaveLength(1);
      expect(all[0]!.businessUnitOrganizationId).toBe(organizationId);
    });

    it("dos unidades de negocio responden el mismo Subindicador sin pisarse, y listResponses filtra por unidad", async () => {
      const { organizationId: matriz, ev, subindicatorId } = await publishedEvaluationWithSubindicator("unidad-particion");
      const { organizationId: unidadA } = await makeOrgWithOwner("unidadA", matriz);
      const { organizationId: unidadB } = await makeOrgWithOwner("unidadB", matriz);

      const rowA = await upsertResponse(ev.id, subindicatorId, { "el-1": "respuesta A" }, unidadA);
      const rowB = await upsertResponse(ev.id, subindicatorId, { "el-1": "respuesta B" }, unidadB);
      expect(rowA.id).not.toBe(rowB.id);
      expect(rowA.businessUnitOrganizationId).toBe(unidadA);
      expect(rowB.businessUnitOrganizationId).toBe(unidadB);

      const all = await listResponses(ev.id);
      expect(all).toHaveLength(2);

      const onlyA = await listResponses(ev.id, unidadA);
      expect(onlyA).toHaveLength(1);
      expect(onlyA[0]!.answers).toEqual({ "el-1": "respuesta A" });
    });

    it("upsert repetido dentro de la misma unidad actualiza la misma fila (unique de 3 columnas)", async () => {
      const { organizationId: matriz, ev, subindicatorId } = await publishedEvaluationWithSubindicator("unidad-upsert");
      const { organizationId: unidadA } = await makeOrgWithOwner("unidadUpsert", matriz);

      const first = await upsertResponse(ev.id, subindicatorId, { "el-1": "v1" }, unidadA);
      const second = await upsertResponse(ev.id, subindicatorId, { "el-1": "v2" }, unidadA);
      expect(second.id).toBe(first.id);
      expect(second.answers).toEqual({ "el-1": "v2" });

      expect(await listResponses(ev.id, unidadA)).toHaveLength(1);
    });

    it("getResponse filtra por unidad: la fila de una unidad no contamina la lectura de otra ni la del flujo público", async () => {
      const { organizationId: matriz, ev, subindicatorId } = await publishedEvaluationWithSubindicator("unidad-get");
      const { organizationId: unidadA } = await makeOrgWithOwner("unidadGet", matriz);
      const { organizationId: unidadB } = await makeOrgWithOwner("unidadGetB", matriz);

      await upsertResponse(ev.id, subindicatorId, { "el-1": "de A" }, unidadA);

      expect((await getResponse(ev.id, subindicatorId, unidadA))?.answers).toEqual({ "el-1": "de A" });
      expect(await getResponse(ev.id, subindicatorId, unidadB)).toBeNull();
      expect(await getResponse(ev.id, subindicatorId)).toBeNull();
    });

    it("borrar la organización unidad de negocio borra en cascada sus respuestas, no las de la matriz", async () => {
      const { organizationId: matriz, ev, subindicatorId } = await publishedEvaluationWithSubindicator("unidad-cascade");
      const { organizationId: unidadA } = await makeOrgWithOwner("unidadCascade", matriz);

      await upsertResponse(ev.id, subindicatorId, { "el-1": "de A" }, unidadA);
      await upsertResponse(ev.id, subindicatorId, { "el-1": "de la matriz" });

      await db.delete(organization).where(eq(organization.id, unidadA));

      const all = await listResponses(ev.id);
      expect(all).toHaveLength(1);
      expect(all[0]!.businessUnitOrganizationId).toBe(matriz);
      expect(all[0]!.answers).toEqual({ "el-1": "de la matriz" });
    });
  });

  describe("VS-052 — bloqueo de escritura tras dueDate (docs/domain/business-units.md)", () => {
    it("upsertResponse rechaza (EvaluationLockedError) una vez vencido el plazo", async () => {
      const { organizationId } = await makeOrgWithOwner("due-locked");
      const fw = await createFramework(organizationId, { name: "Framework Due Locked" });
      const dim = await createDimension(organizationId, { frameworkId: fw.id, title: "Dim" });
      const ind = await createIndicator(organizationId, { dimensionId: dim.id, title: "Ind" });
      const sub = await createSubindicator(organizationId, { indicatorId: ind.id, title: "Sub" });
      await updateSubindicator(organizationId, sub.id, {
        formSchema: { schemaVersion: 1, elements: [{ id: "el-1", type: "texto_corto", label: "Nombre" }] },
      });
      const ev = await createEvaluation(organizationId, {
        frameworkId: fw.id,
        dueDate: new Date(Date.now() - 60 * 1000),
      });

      await expect(upsertResponse(ev.id, sub.id, { "el-1": "tarde" })).rejects.toThrow(EvaluationLockedError);
    });

    it("setElementStatus (que delega en upsertResponse) también queda bloqueado tras dueDate", async () => {
      const { organizationId } = await makeOrgWithOwner("due-status");
      const fw = await createFramework(organizationId, { name: "Framework Due Status" });
      const dim = await createDimension(organizationId, { frameworkId: fw.id, title: "Dim" });
      const ind = await createIndicator(organizationId, { dimensionId: dim.id, title: "Ind" });
      const sub = await createSubindicator(organizationId, { indicatorId: ind.id, title: "Sub" });
      await updateSubindicator(organizationId, sub.id, {
        formSchema: { schemaVersion: 1, elements: [{ id: "el-1", type: "texto_corto", label: "Nombre" }] },
      });
      const ev = await createEvaluation(organizationId, {
        frameworkId: fw.id,
        dueDate: new Date(Date.now() - 60 * 1000),
      });

      await expect(setElementStatus(ev.id, sub.id, "el-1", "completed")).rejects.toThrow(EvaluationLockedError);
    });

    it("la lectura SIEMPRE queda permitida, incluso vencido el plazo", async () => {
      const { ev, subindicatorId } = await publishedEvaluationWithSubindicator("due-read");
      await upsertResponse(ev.id, subindicatorId, { "el-1": "antes de vencer" });
      await db.update(evaluation).set({ dueDate: new Date(Date.now() - 60 * 1000) }).where(eq(evaluation.id, ev.id));

      expect((await getResponse(ev.id, subindicatorId))?.answers).toEqual({ "el-1": "antes de vencer" });
      expect(await listResponses(ev.id)).toHaveLength(1);
    });

    it("escritura permitida mientras el plazo no ha vencido", async () => {
      const { ev, subindicatorId } = await publishedEvaluationWithSubindicator("due-open");
      await db.update(evaluation).set({ dueDate: new Date(Date.now() + 60 * 60 * 1000) }).where(eq(evaluation.id, ev.id));

      const created = await upsertResponse(ev.id, subindicatorId, { "el-1": "a tiempo" });
      expect(created.answers).toEqual({ "el-1": "a tiempo" });
    });
  });
});
