import { randomUUID } from "node:crypto";
import { applySetCookies } from "better-auth/cookies";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { auth } from "../auth.js";
import { db } from "../client.js";
import { createEvaluation, deleteEvaluation } from "../domain/evaluation-service.js";
import { createDimension, createFramework, createIndicator, createSubindicator, updateSubindicator } from "../domain/service.js";
import { listResponses, upsertResponse } from "../domain/response-service.js";
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

async function makeOrgWithOwner(label: string) {
  const email = emailFor(label);
  const signUp = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: label } });
  createdUserIds.add(signUp.user.id);

  const signIn = await auth.api.signInEmail({ body: { email, password: PASSWORD }, returnHeaders: true });
  const headers = new Headers();
  applySetCookies(headers, signIn.headers.getSetCookie());

  const org = await auth.api.createOrganization({
    body: { name: `Org ${label} ${runId}`, slug: `org-resp-${label}-${runId}` },
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
});

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
});
