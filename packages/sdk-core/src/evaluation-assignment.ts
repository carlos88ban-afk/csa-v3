import { z } from "zod";

// Unidades de negocio (VS-050, ver docs/domain/business-units.md).

export const assignEvaluationInput = z.object({
  businessUnitOrganizationId: z.string().min(1),
});
export type AssignEvaluationInput = z.infer<typeof assignEvaluationInput>;

export const setExclusionInput = z.object({
  subindicatorId: z.string().min(1),
  elementId: z.string().min(1).nullable(),
});
export type SetExclusionInput = z.infer<typeof setExclusionInput>;

export interface EvaluationAssignment {
  id: string;
  evaluationId: string;
  businessUnitOrganizationId: string;
  createdAt: Date;
}

export interface EvaluationAssignmentExclusion {
  id: string;
  evaluationAssignmentId: string;
  subindicatorId: string;
  elementId: string | null;
  createdAt: Date;
}
