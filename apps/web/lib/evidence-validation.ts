import type { EvaluationSnapshot, FormElement } from "@plataforma-csa/sdk-core";

// Motor engine/evidences v1 (ver docs/engines/evidences.md). Validación de
// pertenencia y límites contra el snapshot congelado de la Evaluación — nunca
// contra los Subindicadores vivos (mismo principio que response-service.ts:
// el snapshot jsonb es la única fuente de verdad de "qué elementos son
// válidos para esta Evaluación").

type SnapshotSubindicator = EvaluationSnapshot["dimensions"][number]["indicators"][number]["subindicators"][number];

export function findSnapshotSubindicator(
  snapshot: EvaluationSnapshot,
  subindicatorId: string,
): SnapshotSubindicator | null {
  for (const dim of snapshot.dimensions) {
    for (const ind of dim.indicators) {
      const sub = ind.subindicators.find((s) => s.id === subindicatorId);
      if (sub) return sub;
    }
  }
  return null;
}

export function findEvidenceElement(
  sub: SnapshotSubindicator,
  elementId: string,
): Extract<FormElement, { type: "evidencia" }> | null {
  const element = sub.formSchema?.elements.find((el) => el.id === elementId);
  if (!element || element.type !== "evidencia") return null;
  return element;
}

// Acepta la fila de Drizzle (snapshot: unknown) igual que response-service.ts
// castea ev.snapshot — el contrato zod del snapshot se valida en el API layer.
export function resolveEvidenceElement(
  snapshot: EvaluationSnapshot | unknown,
  subindicatorId: string,
  elementId: string,
): { sub: SnapshotSubindicator; element: Extract<FormElement, { type: "evidencia" }> } | null {
  const snap = snapshot as EvaluationSnapshot;
  const sub = findSnapshotSubindicator(snap, subindicatorId);
  if (!sub) return null;
  const element = findEvidenceElement(sub, elementId);
  if (!element) return null;
  return { sub, element };
}

// Límites con defaults del Runtime (ver spec de evidences.md): si el elemento
// no declara el campo, se aplica el default documentado.
export function effectiveMaxFiles(element: Extract<FormElement, { type: "evidencia" }>): number {
  return element.maxFiles ?? 5;
}

export function effectiveMaxSizeMb(element: Extract<FormElement, { type: "evidencia" }>): number {
  return element.maxSizeMb ?? 10;
}

// `acceptedTypes` acepta extensiones ("pdf", "png") o mime types
// ("application/pdf"); un elemento sin el campo acepta cualquier archivo.
export function typeAllowed(element: Extract<FormElement, { type: "evidencia" }>, fileName: string, mimeType: string): boolean {
  const accepted = element.acceptedTypes;
  if (!accepted || accepted.length === 0) return true;
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return accepted.some((t) => {
    const candidate = t.trim().toLowerCase();
    return candidate === mimeType.toLowerCase() || candidate === extension;
  });
}
