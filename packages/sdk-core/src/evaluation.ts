import { z } from "zod";
import { formSchema } from "./form-schema.js";

// Contrato del motor engine/publishing v1 (ver docs/engines/publishing.md).
// El snapshot es una copia completa e inmutable del árbol al momento de
// publicar — no un puntero a revisionNumber (el schema no guarda historial).

export const createEvaluationInput = z.object({
  frameworkId: z.string().min(1),
});
export type CreateEvaluationInput = z.infer<typeof createEvaluationInput>;

const evaluationSnapshotSubindicator = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  formSchema: formSchema.nullable(),
  revisionNumber: z.number(),
});

const evaluationSnapshotIndicator = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  subindicators: z.array(evaluationSnapshotSubindicator),
});

const evaluationSnapshotDimension = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  indicators: z.array(evaluationSnapshotIndicator),
});

export const evaluationSnapshot = z.object({
  frameworkName: z.string(),
  frameworkDescription: z.string().nullable(),
  dimensions: z.array(evaluationSnapshotDimension),
});
export type EvaluationSnapshot = z.infer<typeof evaluationSnapshot>;

export interface Evaluation {
  id: string;
  organizationId: string;
  frameworkId: string;
  token: string;
  title: string;
  snapshot: EvaluationSnapshot;
  publishedAt: Date;
  createdAt: Date;
}
