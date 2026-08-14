import { randomUUID } from "node:crypto";
import { applySetCookies } from "better-auth/cookies";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { auth } from "../auth.js";
import { db } from "../client.js";
import { createDimension, createFramework, createIndicator, createSubindicator, updateSubindicator } from "../domain/service.js";
import { createEvaluation, deleteEvaluation, getEvaluation, getEvaluationByToken, listEvaluations } from "../domain/evaluation-service.js";
import { organization, user } from "../schema/auth.js";
import { dimension, framework, indicator, subindicator } from "../schema/domain.js";
import { evaluation } from "../schema/evaluation.js";

// Contra Neon real (ver docs/RISKS.md R-005) — cada dato usa un runId único
// y se limpia en afterAll.
const runId = randomUUID().slice(0, 8);
const emailFor = (label: string) => `test-eval-${runId}-${label}@example.com`;
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
    body: { name: `Org ${label} ${runId}`, slug: `org-eval-${label}-${runId}` },
    headers,
  });
  createdOrgIds.add(org!.id);

  return { organizationId: org!.id };
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

describe("VS-009 — engine/publishing (contra Neon real)", () => {
  it("publicar genera un snapshot fiel al árbol actual", async () => {
    const { organizationId } = await makeOrgWithOwner("snapshot");

    const fw = await createFramework(organizationId, { name: "Framework Pub" });
    const dim = await createDimension(organizationId, { frameworkId: fw.id, title: "Dim Pub" });
    const ind = await createIndicator(organizationId, { dimensionId: dim.id, title: "Ind Pub" });
    const sub = await createSubindicator(organizationId, { indicatorId: ind.id, title: "Sub Pub" });
    await updateSubindicator(organizationId, sub.id, {
      formSchema: { schemaVersion: 1, elements: [{ id: "el-1", type: "instruccion", label: "Lea con atención" }] },
    });

    const ev = await createEvaluation(organizationId, { frameworkId: fw.id });

    expect(ev.title).toBe("Framework Pub");
    expect(ev.token.length).toBeGreaterThan(20);
    const snapshot = ev.snapshot as { dimensions: unknown[] };
    expect(snapshot.dimensions).toHaveLength(1);
    const snapDim = snapshot.dimensions[0] as { indicators: unknown[]; title: string };
    expect(snapDim.title).toBe("Dim Pub");
    const snapInd = snapDim.indicators[0] as { subindicators: unknown[] };
    const snapSub = snapInd.subindicators[0] as { formSchema: { elements: unknown[] }; revisionNumber: number };
    expect(snapSub.revisionNumber).toBe(2);
    expect(snapSub.formSchema.elements).toHaveLength(1);
  });

  it("editar el Framework/Subindicador después de publicar no cambia la Evaluación ya creada", async () => {
    const { organizationId } = await makeOrgWithOwner("immutable");

    const fw = await createFramework(organizationId, { name: "Framework Inmutable" });
    const dim = await createDimension(organizationId, { frameworkId: fw.id, title: "Dim" });
    const ind = await createIndicator(organizationId, { dimensionId: dim.id, title: "Ind" });
    const sub = await createSubindicator(organizationId, { indicatorId: ind.id, title: "Sub Original" });

    const ev = await createEvaluation(organizationId, { frameworkId: fw.id });

    await updateSubindicator(organizationId, sub.id, { title: "Sub Editado Después de Publicar" });
    await updateSubindicator(organizationId, sub.id, {
      formSchema: {
        schemaVersion: 1,
        elements: [{ id: "el-x", type: "banner", label: "Nuevo", content: "Contenido", variant: "info" }],
      },
    });

    const [reloaded] = await listEvaluations(organizationId, fw.id);
    const snapshot = reloaded!.snapshot as { dimensions: Array<{ indicators: Array<{ subindicators: Array<{ title: string; formSchema: unknown }> }> }> };
    const snapSub = snapshot.dimensions[0]!.indicators[0]!.subindicators[0]!;
    expect(snapSub.title).toBe("Sub Original");
    expect(snapSub.formSchema).toBeNull();
    expect(reloaded!.id).toBe(ev.id);
  });

  it("getEvaluationByToken no requiere sesión y devuelve null para token inexistente o revocado", async () => {
    const { organizationId } = await makeOrgWithOwner("token");

    const fw = await createFramework(organizationId, { name: "Framework Token" });
    const ev = await createEvaluation(organizationId, { frameworkId: fw.id });

    const found = await getEvaluationByToken(ev.token);
    expect(found?.id).toBe(ev.id);

    expect(await getEvaluationByToken("token-que-nunca-existio")).toBeNull();

    await deleteEvaluation(organizationId, ev.id);
    expect(await getEvaluationByToken(ev.token)).toBeNull();
  });

  it("getEvaluation (VS-012) es tenant-scoped: null para una Evaluación de otra organización", async () => {
    const { organizationId: owner } = await makeOrgWithOwner("export-owner");
    const { organizationId: intruder } = await makeOrgWithOwner("export-intruder");

    const fw = await createFramework(owner, { name: "Framework Export" });
    const ev = await createEvaluation(owner, { frameworkId: fw.id });

    const found = await getEvaluation(owner, ev.id);
    expect(found?.id).toBe(ev.id);

    expect(await getEvaluation(intruder, ev.id)).toBeNull();
    expect(await getEvaluation(owner, "evaluation-que-nunca-existio")).toBeNull();
  });

  it("no se puede publicar un framework de otra organización", async () => {
    const { organizationId: orgA } = await makeOrgWithOwner("cross-a");
    const { organizationId: orgB } = await makeOrgWithOwner("cross-b");

    const fwInA = await createFramework(orgA, { name: "Framework Org A" });

    await expect(createEvaluation(orgB, { frameworkId: fwInA.id })).rejects.toThrow();
  });
});
