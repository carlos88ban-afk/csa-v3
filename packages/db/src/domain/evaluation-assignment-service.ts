import { randomUUID } from "node:crypto";
import type { AssignEvaluationInput, SetExclusionInput } from "@plataforma-csa/sdk-core";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../client.js";
import { organization } from "../schema/auth.js";
import { evaluationAssignment, evaluationAssignmentExclusion } from "../schema/evaluation-assignment.js";
import { getEvaluation } from "./evaluation-service.js";
import { NotFoundError } from "./service.js";

// Unidades de negocio (VS-050, ver docs/domain/business-units.md). Toda
// función aquí recibe `organizationId` de la ORGANIZACIÓN MATRIZ (dueña de
// la Evaluación) y valida contra ella — es quien administra asignaciones y
// exclusiones, nunca la unidad de negocio en sí.

async function requireMatrizEvaluation(organizationId: string, evaluationId: string) {
  const ev = await getEvaluation(organizationId, evaluationId);
  if (!ev) throw new NotFoundError("evaluation");
  return ev;
}

async function requireChildOrganization(matrizOrganizationId: string, businessUnitOrganizationId: string) {
  const [org] = await db.select().from(organization).where(eq(organization.id, businessUnitOrganizationId));
  if (!org || org.parentOrganizationId !== matrizOrganizationId) {
    throw new NotFoundError("business_unit_organization");
  }
  return org;
}

export async function assignEvaluation(
  organizationId: string,
  evaluationId: string,
  input: AssignEvaluationInput,
) {
  await requireMatrizEvaluation(organizationId, evaluationId);
  await requireChildOrganization(organizationId, input.businessUnitOrganizationId);

  const [existing] = await db
    .select()
    .from(evaluationAssignment)
    .where(
      and(
        eq(evaluationAssignment.evaluationId, evaluationId),
        eq(evaluationAssignment.businessUnitOrganizationId, input.businessUnitOrganizationId),
      ),
    );
  if (existing) return existing;

  const [row] = await db
    .insert(evaluationAssignment)
    .values({ id: randomUUID(), evaluationId, businessUnitOrganizationId: input.businessUnitOrganizationId })
    .returning();
  if (!row) throw new Error("Failed to insert evaluation_assignment");
  return row;
}

export async function unassignEvaluation(organizationId: string, evaluationId: string, assignmentId: string) {
  await requireMatrizEvaluation(organizationId, evaluationId);
  const [row] = await db
    .delete(evaluationAssignment)
    .where(and(eq(evaluationAssignment.id, assignmentId), eq(evaluationAssignment.evaluationId, evaluationId)))
    .returning();
  return row ?? null;
}

export async function listAssignments(organizationId: string, evaluationId: string) {
  await requireMatrizEvaluation(organizationId, evaluationId);
  return db.select().from(evaluationAssignment).where(eq(evaluationAssignment.evaluationId, evaluationId));
}

// Sin `organizationId`: resuelto desde la sesión de la UNIDAD DE NEGOCIO
// (su propia organización activa), no de la matriz — usado por el flujo de
// acceso autenticado del evaluado (ver "Acceso del evaluado" en el spec).
export async function getAssignmentForBusinessUnit(evaluationId: string, businessUnitOrganizationId: string) {
  const [row] = await db
    .select()
    .from(evaluationAssignment)
    .where(
      and(
        eq(evaluationAssignment.evaluationId, evaluationId),
        eq(evaluationAssignment.businessUnitOrganizationId, businessUnitOrganizationId),
      ),
    );
  return row ?? null;
}

async function requireOwnedAssignment(organizationId: string, evaluationId: string, assignmentId: string) {
  await requireMatrizEvaluation(organizationId, evaluationId);
  const [assignment] = await db
    .select()
    .from(evaluationAssignment)
    .where(and(eq(evaluationAssignment.id, assignmentId), eq(evaluationAssignment.evaluationId, evaluationId)));
  if (!assignment) throw new NotFoundError("evaluation_assignment");
  return assignment;
}

export async function setExclusion(
  organizationId: string,
  evaluationId: string,
  assignmentId: string,
  input: SetExclusionInput,
) {
  await requireOwnedAssignment(organizationId, evaluationId, assignmentId);

  // Dedup manual de la fila "Subindicador completo" (elementId = null):
  // Postgres no puede deduplicarla vía unique constraint (ver schema).
  if (input.elementId === null) {
    const [existing] = await db
      .select()
      .from(evaluationAssignmentExclusion)
      .where(
        and(
          eq(evaluationAssignmentExclusion.evaluationAssignmentId, assignmentId),
          eq(evaluationAssignmentExclusion.subindicatorId, input.subindicatorId),
          isNull(evaluationAssignmentExclusion.elementId),
        ),
      );
    if (existing) return existing;
  }

  const [row] = await db
    .insert(evaluationAssignmentExclusion)
    .values({
      id: randomUUID(),
      evaluationAssignmentId: assignmentId,
      subindicatorId: input.subindicatorId,
      elementId: input.elementId,
    })
    .returning();
  if (!row) throw new Error("Failed to insert evaluation_assignment_exclusion");
  return row;
}

export async function removeExclusion(
  organizationId: string,
  evaluationId: string,
  assignmentId: string,
  exclusionId: string,
) {
  await requireOwnedAssignment(organizationId, evaluationId, assignmentId);
  const [row] = await db
    .delete(evaluationAssignmentExclusion)
    .where(
      and(
        eq(evaluationAssignmentExclusion.id, exclusionId),
        eq(evaluationAssignmentExclusion.evaluationAssignmentId, assignmentId),
      ),
    )
    .returning();
  return row ?? null;
}

// Sin `organizationId`: usado tanto por el panel Publicar (admin, ya
// validó el assignment con requireOwnedAssignment antes de llamar esto)
// como por el flujo de acceso autenticado de la unidad de negocio (ya
// resolvió el assignment vía getAssignmentForBusinessUnit).
export async function listExclusions(evaluationAssignmentId: string) {
  return db
    .select()
    .from(evaluationAssignmentExclusion)
    .where(eq(evaluationAssignmentExclusion.evaluationAssignmentId, evaluationAssignmentId));
}
