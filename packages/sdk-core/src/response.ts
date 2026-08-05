import { z } from "zod";

// Contrato del motor engine/persistence v1 (ver docs/engines/persistence.md).
// answers es un mapa elementId -> valor; claves ausentes = no respondido
// todavía (mismo criterio que permitir label vacío en form-schema.ts).

export const answerValue = z.union([z.string(), z.number(), z.array(z.string())]);
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
