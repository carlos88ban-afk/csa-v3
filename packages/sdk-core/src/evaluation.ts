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
  // Subindicadores directos (VS-029, docs/domain/evaluation-hierarchy.md):
  // sin Indicador intermedio — hallazgo del portal S&P (0.1, 5.x).
  subindicators: z.array(evaluationSnapshotSubindicator),
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

// Numeración automática del árbol (VS-021, ver
// docs/domain/evaluation-hierarchy.md). Derivada de la posición (0-based)
// dentro del array ya ordenado de su nivel — nunca persistida, reordenar
// renumera solo.
export function dimensionNumber(dimIndex: number): string {
  return String(dimIndex + 1);
}
export function indicatorNumber(dimIndex: number, indIndex: number): string {
  return `${dimensionNumber(dimIndex)}.${indIndex + 1}`;
}
export function subindicatorNumber(dimIndex: number, indIndex: number, subIndex: number): string {
  return `${indicatorNumber(dimIndex, indIndex)}.${subIndex + 1}`;
}

// Subindicadores directos bajo Dimensión (VS-029). Convención deliberada,
// sin caso mixto observado (ver docs/domain/evaluation-hierarchy.md): se
// numeran DESPUÉS de todos los Indicadores de la misma Dimensión, no
// intercalados por orden de creación.
export function directSubindicatorNumber(dimIndex: number, indicatorCount: number, subIndex: number): string {
  return `${dimensionNumber(dimIndex)}.${indicatorCount + subIndex + 1}`;
}
