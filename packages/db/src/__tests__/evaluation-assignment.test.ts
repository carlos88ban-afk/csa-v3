import { randomUUID } from "node:crypto";
import { applySetCookies } from "better-auth/cookies";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { auth } from "../auth.js";
import { db } from "../client.js";
import { createFramework } from "../domain/service.js";
import { createEvaluation } from "../domain/evaluation-service.js";
import {
  assignEvaluation,
  listAssignments,
  listExclusions,
  removeExclusion,
  setExclusion,
  unassignEvaluation,
} from "../domain/evaluation-assignment-service.js";
import { organization, user } from "../schema/auth.js";
import { dimension, framework, indicator, subindicator } from "../schema/domain.js";
import { evaluation } from "../schema/evaluation.js";
import { evaluationAssignment, evaluationAssignmentExclusion } from "../schema/evaluation-assignment.js";

// Unidades de negocio (VS-050, ver docs/domain/business-units.md). Contra
// Neon real (ver docs/RISKS.md R-005), mismo patrón que evaluation.test.ts.
const runId = randomUUID().slice(0, 8);
const emailFor = (label: string) => `test-assign-${runId}-${label}@example.com`;
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
      slug: `org-assign-${label}-${runId}`,
      ...(parentOrganizationId ? { parentOrganizationId } : {}),
    },
    headers,
  });
  createdOrgIds.add(org!.id);

  return { organizationId: org!.id };
}

afterAll(async () => {
  await Promise.all(
    Array.from(createdOrgIds).map(async (organizationId) => {
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

describe("VS-050 — unidades de negocio: asignación + exclusiones (contra Neon real)", () => {
  it("asigna una Evaluación a una unidad de negocio hija y la lista", async () => {
    const { organizationId: matriz } = await makeOrgWithOwner("matriz-a");
    const { organizationId: unidad } = await makeOrgWithOwner("unidad-a", matriz);

    const fw = await createFramework(matriz, { name: "Framework Matriz A" });
    const ev = await createEvaluation(matriz, { frameworkId: fw.id });

    const assignment = await assignEvaluation(matriz, ev.id, { businessUnitOrganizationId: unidad });
    expect(assignment.businessUnitOrganizationId).toBe(unidad);

    const assignments = await listAssignments(matriz, ev.id);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]!.id).toBe(assignment.id);
  });

  it("asignar dos veces la misma unidad no duplica la fila", async () => {
    const { organizationId: matriz } = await makeOrgWithOwner("matriz-dup");
    const { organizationId: unidad } = await makeOrgWithOwner("unidad-dup", matriz);

    const fw = await createFramework(matriz, { name: "Framework Dup" });
    const ev = await createEvaluation(matriz, { frameworkId: fw.id });

    const first = await assignEvaluation(matriz, ev.id, { businessUnitOrganizationId: unidad });
    const second = await assignEvaluation(matriz, ev.id, { businessUnitOrganizationId: unidad });
    expect(second.id).toBe(first.id);

    const assignments = await listAssignments(matriz, ev.id);
    expect(assignments).toHaveLength(1);
  });

  it("rechaza asignar una organización que no es hija de la matriz", async () => {
    const { organizationId: matriz } = await makeOrgWithOwner("matriz-b");
    const { organizationId: ajena } = await makeOrgWithOwner("ajena-b");

    const fw = await createFramework(matriz, { name: "Framework Matriz B" });
    const ev = await createEvaluation(matriz, { frameworkId: fw.id });

    await expect(assignEvaluation(matriz, ev.id, { businessUnitOrganizationId: ajena })).rejects.toThrow();
  });

  it("tenant-scoping: una organización que no es dueña de la Evaluación no puede asignarla ni listarla", async () => {
    const { organizationId: matriz } = await makeOrgWithOwner("matriz-c");
    const { organizationId: unidad } = await makeOrgWithOwner("unidad-c", matriz);
    const { organizationId: intruder } = await makeOrgWithOwner("intruder-c");

    const fw = await createFramework(matriz, { name: "Framework Matriz C" });
    const ev = await createEvaluation(matriz, { frameworkId: fw.id });

    await expect(assignEvaluation(intruder, ev.id, { businessUnitOrganizationId: unidad })).rejects.toThrow();
    await expect(listAssignments(intruder, ev.id)).rejects.toThrow();
  });

  it("desasigna una unidad de negocio", async () => {
    const { organizationId: matriz } = await makeOrgWithOwner("matriz-d");
    const { organizationId: unidad } = await makeOrgWithOwner("unidad-d", matriz);

    const fw = await createFramework(matriz, { name: "Framework Matriz D" });
    const ev = await createEvaluation(matriz, { frameworkId: fw.id });
    const assignment = await assignEvaluation(matriz, ev.id, { businessUnitOrganizationId: unidad });

    const removed = await unassignEvaluation(matriz, ev.id, assignment.id);
    expect(removed?.id).toBe(assignment.id);
    expect(await listAssignments(matriz, ev.id)).toHaveLength(0);
  });

  it("marca exclusión de Subindicador completo (elementId null) sin duplicar, y exclusión de elemento puntual", async () => {
    const { organizationId: matriz } = await makeOrgWithOwner("matriz-e");
    const { organizationId: unidad } = await makeOrgWithOwner("unidad-e", matriz);

    const fw = await createFramework(matriz, { name: "Framework Matriz E" });
    const ev = await createEvaluation(matriz, { frameworkId: fw.id });
    const assignment = await assignEvaluation(matriz, ev.id, { businessUnitOrganizationId: unidad });

    const fullExclusion1 = await setExclusion(matriz, ev.id, assignment.id, {
      subindicatorId: "sub-1",
      elementId: null,
    });
    const fullExclusion2 = await setExclusion(matriz, ev.id, assignment.id, {
      subindicatorId: "sub-1",
      elementId: null,
    });
    expect(fullExclusion2.id).toBe(fullExclusion1.id);

    const elementExclusion = await setExclusion(matriz, ev.id, assignment.id, {
      subindicatorId: "sub-2",
      elementId: "el-9",
    });
    expect(elementExclusion.elementId).toBe("el-9");

    const exclusions = await listExclusions(assignment.id);
    expect(exclusions).toHaveLength(2);

    await removeExclusion(matriz, ev.id, assignment.id, elementExclusion.id);
    expect(await listExclusions(assignment.id)).toHaveLength(1);
  });

  it("borrar la Evaluación borra en cascada sus assignments y exclusiones", async () => {
    const { organizationId: matriz } = await makeOrgWithOwner("matriz-f");
    const { organizationId: unidad } = await makeOrgWithOwner("unidad-f", matriz);

    const fw = await createFramework(matriz, { name: "Framework Matriz F" });
    const ev = await createEvaluation(matriz, { frameworkId: fw.id });
    const assignment = await assignEvaluation(matriz, ev.id, { businessUnitOrganizationId: unidad });
    await setExclusion(matriz, ev.id, assignment.id, { subindicatorId: "sub-1", elementId: null });

    await db.delete(evaluation).where(eq(evaluation.id, ev.id));

    const [remainingAssignment] = await db
      .select()
      .from(evaluationAssignment)
      .where(eq(evaluationAssignment.id, assignment.id));
    expect(remainingAssignment).toBeUndefined();

    const remainingExclusions = await db
      .select()
      .from(evaluationAssignmentExclusion)
      .where(eq(evaluationAssignmentExclusion.evaluationAssignmentId, assignment.id));
    expect(remainingExclusions).toHaveLength(0);
  });
});
