import { z } from "zod";

// Contrato del motor engine/persistence v1 (ver docs/engines/persistence.md).
// answers es un mapa elementId -> valor; claves ausentes = no respondido
// todavía (mismo criterio que permitir label vacío en form-schema.ts).

// Referencia a un archivo ya subido a R2 (ver docs/engines/evidences.md). El
// valor de un elemento `evidencia` es un array de estas refs — no un string[]
// de keys: el Runtime necesita nombre/tamaño/tipo para renderizar sin pedir
// metadata a R2.
export const evidenceRef = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  size: z.number().nonnegative(),
  mimeType: z.string(),
});
export type EvidenceRef = z.infer<typeof evidenceRef>;

export const answerValue = z.union([z.string(), z.number(), z.array(z.string()), z.array(evidenceRef)]);
export type AnswerValue = z.infer<typeof answerValue>;

export const responseAnswers = z.record(z.string(), answerValue);
export type ResponseAnswers = z.infer<typeof responseAnswers>;

export const upsertResponseInput = z.object({ answers: responseAnswers });
export type UpsertResponseInput = z.infer<typeof upsertResponseInput>;

export interface Response {
  id: string;
  evaluationId: string;
  subindicatorId: string;
  answers: ResponseAnswers;
  createdAt: Date;
  updatedAt: Date;
}
