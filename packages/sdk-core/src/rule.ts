import { z } from "zod";
import { type ResponseAnswers, hasAnswer } from "./response.js";

// Contrato del motor engine/rule v1 (ver docs/engines/rule.md).

export const condition = z.object({
  elementId: z.string().min(1),
  operator: z.enum(["equals", "notEquals", "contains", "isAnswered", "isEmpty"]),
  value: z.union([z.string(), z.number()]).optional(),
});
export type Condition = z.infer<typeof condition>;

export function isElementVisible(cond: Condition | undefined, answers: ResponseAnswers): boolean {
  if (cond === undefined) return true;
  const value = answers[cond.elementId];
  switch (cond.operator) {
    case "isAnswered":
      return hasAnswer(value);
    case "isEmpty":
      return !hasAnswer(value);
    case "equals":
      if (Array.isArray(value)) return false;
      return value === cond.value;
    case "notEquals":
      return !(value === cond.value);
    case "contains":
      // Solo aplica a seleccion_multiple (string[]); un array de
      // EvidenceRef simplemente no puede "contener" un string/number.
      if (!Array.isArray(value) || cond.value === undefined) return false;
      return (value as unknown[]).includes(cond.value);
  }
}
