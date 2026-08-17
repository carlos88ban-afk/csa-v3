import { z } from "zod";
import { formSchema } from "./form-schema.js";

// Contrato del motor engine/publishing v1 (ver docs/engines/publishing.md).
// El snapshot es una copia completa e inmutable del árbol al momento de
// publicar — no un puntero a revisionNumber (el schema no guarda historial).

export const createEvaluationInput = z.object({
  frameworkId: z.string().min(1),
  // VS-052 (docs/domain/business-units.md, "Plazo de recepción"): el panel
  // Publicar fija el plazo (y el correo de contacto) al momento de crear la
  // Evaluación. Sin plazo por defecto (`null`), mismo espíritu que la
  // expiración por fecha de publishing.md.
  dueDate: z.coerce.date().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
});
export type CreateEvaluationInput = z.infer<typeof createEvaluationInput>;

// VS-052 — edición del plazo desde el panel Publicar. `undefined` = no tocar
// el campo; `null` = limpiar. Las reglas de negocio (no volver a `null` una
// vez fijado, solo fechas futuras) viven en evaluation-service.ts, no acá,
// porque dependen del estado previo de la fila en la DB.
export const updateEvaluationInput = z.object({
  dueDate: z.coerce.date().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
});
export type UpdateEvaluationInput = z.infer<typeof updateEvaluationInput>;

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
  // VS-052 — plazo de recepción y correo de contacto (ver business-units.md
  // "Plazo de recepción (dueDate) y comportamiento del banner").
  dueDate: Date | null;
  contactEmail: string | null;
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
