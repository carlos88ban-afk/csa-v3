import { componentRegistry } from "./component-registry.js";
import type { FormElement } from "./form-schema.js";
import { isElementVisible } from "./rule.js";
import { hasAnswer, naKey, statusKey, type ResponseAnswers } from "./response.js";

// VS-033: semáforo por pregunta, compartido por el runtime (web) y el tablero
// corporativo (db). Completa = respondida (o N/A / marcada lista); parcial =
// respondida pero incompleta (celdas editables vacías de una tabla o
// sub-opciones sin elegir); sin responder = sin respuesta.
export type Completion = "complete" | "partial" | "empty";

export function completionOf(el: FormElement, a: ResponseAnswers): Completion {
  const explicit = a[statusKey(el.id)] as string | undefined;
  if (explicit === "completed" || explicit === "approved" || explicit === "submitted") return "complete";
  if ((a[naKey(el.id)] as string | undefined) === "true") return "complete";
  const v = a[el.id];
  if (!hasAnswer(v)) return "empty";
  if (el.type === "tabla_datos" && v && typeof v === "object" && !Array.isArray(v)) {
    const table = el as unknown as { rows?: { id: string; cells: { columnId: string; editable?: boolean }[] }[] };
    const grid = v as unknown as Record<string, Record<string, unknown>>;
    let total = 0;
    let filled = 0;
    for (const row of table.rows ?? []) {
      for (const c of row.cells) {
        if (!c.editable) continue;
        total++;
        const cell = grid[row.id]?.[c.columnId];
        const has =
          typeof cell === "object" && cell !== null
            ? Object.values(cell).some((x) => x !== undefined && x !== "")
            : cell !== undefined && cell !== "";
        if (has) filled++;
      }
    }
    return total > 0 && filled < total ? "partial" : "complete";
  }
  if ((el.type === "seleccion_unica" || el.type === "seleccion_multiple") && "options" in el) {
    const picked = Array.isArray(v) ? (v as unknown[]) : [v];
    for (const o of el.options ?? []) {
      const subs = (o as { subOptions?: unknown[] }).subOptions;
      if (picked.includes(o.id) && subs && subs.length > 0 && !hasAnswer(a[`${el.id}::${o.id}`])) return "partial";
    }
  }
  return "complete";
}

// Un tema (subindicador) cuenta como UNA pregunta, aunque lleve varias preguntas
// internas o una evidencia. Su estado resume las preguntas que de verdad se le piden al
// usuario: visibles, que le tocan (no solo-lectura) y, si hay otras, sin contar la evidencia opcional.
const QUESTION_TYPES = new Set<string>(componentRegistry.filter((c) => c.isQuestion).map((c) => c.type));

export function temaQuestions(elements: FormElement[], a: ResponseAnswers): FormElement[] {
  const qs = elements.filter((el) => QUESTION_TYPES.has(el.type) && !el.viewerReadOnly && isElementVisible(el.visibleIf, a));
  const core = qs.filter((el) => !(el.type === "evidencia" && !(el as { required?: boolean }).required));
  return core.length > 0 ? core : qs;
}

/**
 * Nivel de avance del tema (1–4 cuadritos):
 * 1 = sin responder · 2 = respondida pero faltan sub-opciones o datos · 3 = respondida, falta la evidencia ·
 * 4 = completa (con evidencia adjunta si el tema la pide). null = el tema no tiene nada que responder.
 */
export type TemaLevel = 1 | 2 | 3 | 4;
export function temaLevel(elements: FormElement[], a: ResponseAnswers): TemaLevel | null {
  const qs = elements.filter((el) => QUESTION_TYPES.has(el.type) && !el.viewerReadOnly && isElementVisible(el.visibleIf, a));
  if (qs.length === 0) return null;
  const evidence = qs.filter((el) => el.type === "evidencia");
  const core = qs.filter((el) => el.type !== "evidencia");
  const hasEvidence = evidence.some((el) => hasAnswer(a[el.id]));
  if (core.length === 0) return hasEvidence ? 4 : 1;
  const states = core.map((el) => completionOf(el, a));
  if (states.every((c) => c === "empty")) return 1;
  if (!states.every((c) => c === "complete")) return 2;
  if (evidence.length === 0) return 4;
  return hasEvidence ? 4 : 3;
}

/** Estado del tema como una sola pregunta; null si no tiene nada que responder. Completo = 4 cuadritos. */
export function temaCompletion(elements: FormElement[], a: ResponseAnswers): Completion | null {
  const level = temaLevel(elements, a);
  if (level === null) return null;
  return level === 4 ? "complete" : level === 1 ? "empty" : "partial";
}
