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

// Criterio compartido de "¿tiene respuesta?": lo usa progreso (docs/engines/persistence.md) y visibilidad (docs/engines/rule.md).
export function hasAnswer(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

// Estado explícito por pregunta (VS-018, docs/engines/persistence.md).
export const elementStatus = z.enum(["completed", "approved", "submitted"]);
export type ElementStatus = z.infer<typeof elementStatus>;

export type DerivedStatus = "not_started" | "in_progress" | ElementStatus;

export function statusKey(elementId: string): string {
  return `${elementId}::status`;
}

export function deriveStatus(explicit: string | undefined, answered: boolean): DerivedStatus {
  if (explicit === "completed" || explicit === "approved" || explicit === "submitted") return explicit;
  return answered ? "in_progress" : "not_started";
}

export const setElementStatusInput = z.object({
  elementId: z.string().min(1),
  status: elementStatus.nullable(),
});
export type SetElementStatusInput = z.infer<typeof setElementStatusInput>;

export class LockedElementError extends Error {
  constructor(public readonly elementId: string) {
    super(`element_LOCKED:${elementId}`);
    this.name = "LockedElementError";
  }
}

// Se corre en la ruta pública, nunca en la autenticada (ese lado es de
// confianza, mismo criterio que el resto de las rutas de escritura del
// dominio). `current` = lo que ya hay en DB para ese Subindicador (o {} si
// es la primera respuesta); `incoming` = el mapa completo que mandó el
// cliente.
export function assertPublicResponseUpdateAllowed(current: ResponseAnswers, incoming: ResponseAnswers): void {
  for (const [key, value] of Object.entries(incoming)) {
    if (!key.endsWith("::status")) continue;
    const elementId = key.slice(0, -"::status".length);
    const currentStatus = current[key];
    // Regla A: un estado ya aprobado/enviado es de solo lectura desde el
    // lado público — ni tocarlo ni "reafirmarlo" con otro valor distinto.
    if ((currentStatus === "approved" || currentStatus === "submitted") && value !== currentStatus) {
      throw new LockedElementError(elementId);
    }
    // Regla B: no se puede saltar directo a approved/submitted desde el
    // lado público — esas dos transiciones solo las hace la ruta autenticada.
    if ((value === "approved" || value === "submitted") && value !== currentStatus) {
      throw new LockedElementError(elementId);
    }
    // Regla C: no se puede marcar completed sin una respuesta real.
    if (value === "completed" && !hasAnswer(incoming[elementId])) {
      throw new LockedElementError(elementId);
    }
  }
  // Regla D: si un elemento está approved/submitted, su respuesta también
  // queda congelada desde el lado público (evita invalidar en silencio una
  // aprobación ya dada editando la respuesta debajo).
  for (const [key, currentValue] of Object.entries(current)) {
    if (!key.endsWith("::status")) continue;
    if (currentValue !== "approved" && currentValue !== "submitted") continue;
    const elementId = key.slice(0, -"::status".length);
    if (elementId in incoming && JSON.stringify(incoming[elementId]) !== JSON.stringify(current[elementId])) {
      throw new LockedElementError(elementId);
    }
  }
}
