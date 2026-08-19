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

// Respuesta de tabla_datos (VS-024, docs/engines/form.md "Tabla de datos"):
// mapa anidado rowId -> columnId -> valor de celda, no un array de filas —
// mismo criterio de mapas keyed-por-id ya usado en todo el motor (answers
// en sí, las claves sintéticas ::status/::na/::comment/::unit).
export const tableCellValue = z.union([z.string(), z.number()]);
export type TableCellValue = z.infer<typeof tableCellValue>;
// VS-074/075 (docs/engines/form.md "Fase 2: componentes independientes por
// celda"): una celda con `formTableCell.components` guarda un mapa
// componentId -> valor en vez de un único escalar. Qué formato aplica lo
// decide el SCHEMA (¿esa celda tiene `components`?), nunca se infiere del
// valor guardado — una celda legacy sigue siendo puramente escalar, cero
// cambio de comportamiento para datos/código ya existentes.
export const tableCellComponentValue = z.record(z.string(), tableCellValue);
export type TableCellComponentValue = z.infer<typeof tableCellComponentValue>;
export const tableValue = z.record(z.string(), z.record(z.string(), z.union([tableCellValue, tableCellComponentValue])));
export type TableValue = z.infer<typeof tableValue>;

// Referencias flexibles por opción/sub-opción (VS-045, docs/engines/form.md):
// cada slot es una URL literal (refType "public") o una EvidenceRef
// (refType "flexible", documento interno subido a R2). Los arrays de strings
// guardados antes de VS-045 siguen validando contra esta unión (cada
// elemento valida contra `z.string()`) — compatible sin migración.
export const optionReferenceValue = z.union([z.string(), evidenceRef]);
export type OptionReferenceValue = z.infer<typeof optionReferenceValue>;

export const answerValue = z.union([
  z.string(),
  z.number(),
  z.array(z.string()),
  z.array(evidenceRef),
  z.array(optionReferenceValue),
  tableValue,
]);
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

// VS-074/075: una celda de tabla puede ser el escalar legacy o el mapa
// componentId -> valor de la Fase 2 (ver `tableValue` arriba) — mismo
// criterio recursivo "algún valor no vacío cuenta como respondido" un nivel
// más adentro para el segundo caso.
function hasCellValue(cell: TableCellValue | TableCellComponentValue): boolean {
  if (cell === undefined || cell === "") return false;
  if (typeof cell === "object") return Object.values(cell).some((v) => v !== undefined && v !== "");
  return true;
}

// Criterio compartido de "¿tiene respuesta?": lo usa progreso (docs/engines/persistence.md) y visibilidad (docs/engines/rule.md).
export function hasAnswer(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  // tabla_datos (VS-024): un objeto (no array) cuenta como respondido si
  // alguna celda de alguna fila tiene valor — no exige la tabla completa,
  // mismo criterio "guarda estado intermedio" del resto del motor.
  if (typeof value === "object") {
    return Object.values(value).some((row) => Object.values(row).some((cell) => hasCellValue(cell)));
  }
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
    // Regla C: no se puede marcar completed sin una respuesta real o N/A
    // (VS-019, docs/engines/persistence.md — una pregunta N/A cuenta como
    // resuelta para "completar", igual que para progreso).
    if (value === "completed" && !isAnswered(incoming[elementId], incoming[naKey(elementId)] as string | undefined)) {
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

export function naKey(elementId: string): string {
  return `${elementId}::na`;
}
export function commentKey(elementId: string): string {
  return `${elementId}::comment`;
}
// Unidad elegida por el evaluado cuando `numero.availableUnits` está
// presente (VS-023, docs/engines/form.md). Clave sintética, no ensancha
// AnswerValue — mismo patrón que naKey/commentKey.
export function unitKey(elementId: string): string {
  return `${elementId}::unit`;
}
export function isAnswered(value: AnswerValue | undefined, na: string | undefined): boolean {
  return hasAnswer(value) || na === "true";
}
