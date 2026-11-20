import { componentRegistry } from "./component-registry.js";
import type { FormElement } from "./form-schema.js";
import { isElementVisible } from "./rule.js";
import { hasAnswer, naKey, statusKey, type ResponseAnswers } from "./response.js";

// VS-033: semáforo por pregunta, compartido por el runtime (web) y el tablero
// corporativo (db). Completa = respondida (o N/A / marcada lista); parcial =
// respondida pero incompleta (celdas editables vacías de una tabla o
// sub-opciones sin elegir); sin responder = sin respuesta.
export type Completion = "complete" | "partial" | "empty";

type SubNode = { id: string; subOptions?: SubNode[]; subOptionsExclusive?: boolean };
function missingDeep(a: ResponseAnswers, key: string, options: SubNode[]): boolean {
  const raw = a[key];
  const sel = Array.isArray(raw) ? (raw as unknown[]) : [raw];
  for (const o of options) {
    if (!sel.includes(o.id) || !o.subOptions || o.subOptions.length === 0) continue;
    if (!hasAnswer(a[`${key}::${o.id}`])) return true;
    if (missingDeep(a, `${key}::${o.id}`, o.subOptions)) return true;
  }
  return false;
}

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
      if (picked.includes(o.id) && subs && subs.length > 0) {
        if (!hasAnswer(a[`${el.id}::${o.id}`])) return "partial";
        // Una sub-opción marcada que a su vez tiene sub-sub-opciones sin elegir también deja el tema incompleto.
        if (missingDeep(a, `${el.id}::${o.id}`, subs as SubNode[])) return "partial";
      }
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

// Regla de la mayoria (VS-081): se cuentan TODOS los elementos de sub-opciones de las opciones elegidas
// (sub-opciones y sub-sub-opciones, cada grupo excluyente cuenta como 1) y las celdas editables de las tablas.
// "Mayoria" = mas de la mitad completados (4 de 6 si; 3 de 6 no).
function groupProgress(a: ResponseAnswers, key: string, options: Array<{ id: string; subOptions?: unknown[]; subOptionsExclusive?: boolean }>, exclusive: boolean) {
  const raw = a[key];
  const sel = Array.isArray(raw) ? (raw as unknown[]).filter((x) => typeof x === "string") : typeof raw === "string" && raw ? [raw] : [];
  let total = exclusive ? 1 : options.length;
  let done = exclusive ? (sel.length > 0 ? 1 : 0) : sel.length;
  for (const o of options) {
    const children = (o.subOptions ?? []) as Array<{ id: string; subOptions?: unknown[]; subOptionsExclusive?: boolean }>;
    if (children.length > 0) {
      const p = groupProgress(a, `${key}::${o.id}`, children, o.subOptionsExclusive ?? false);
      total += p.total;
      done += p.done;
    }
  }
  return { done, total };
}

export function elementProgress(el: FormElement, a: ResponseAnswers): { done: number; total: number } {
  const v = a[el.id];
  if (el.type === "tabla_datos" && v && typeof v === "object" && !Array.isArray(v)) {
    const table = el as unknown as { rows?: { id: string; cells: { columnId: string; editable?: boolean }[] }[] };
    const grid = v as unknown as Record<string, Record<string, unknown>>;
    let total = 0;
    let done = 0;
    for (const row of table.rows ?? []) {
      for (const c of row.cells) {
        if (!c.editable) continue;
        total++;
        const cell = grid[row.id]?.[c.columnId];
        const has = typeof cell === "object" && cell !== null ? Object.values(cell).some((x) => x !== undefined && x !== "") : cell !== undefined && cell !== "";
        if (has) done++;
      }
    }
    return { done, total };
  }
  if ((el.type === "seleccion_unica" || el.type === "seleccion_multiple") && "options" in el) {
    const picked = Array.isArray(v) ? (v as unknown[]) : [v];
    let done = 0;
    let total = 0;
    for (const o of el.options ?? []) {
      if (!picked.includes(o.id)) continue;
      const opt = o as unknown as {
        subOptions?: Array<{ id: string; subOptions?: unknown[]; subOptionsExclusive?: boolean }>;
        subOptionsExclusive?: boolean;
        secondaryOptions?: Array<{ id: string; subOptions?: unknown[]; subOptionsExclusive?: boolean }>;
        secondaryOptionsExclusive?: boolean;
        moreBlocks?: Array<{ options: Array<{ id: string; subOptions?: unknown[]; subOptionsExclusive?: boolean }>; exclusive?: boolean }>;
      };
      const base = `${el.id}::${o.id}`;
      const add = (p: { done: number; total: number }) => {
        done += p.done;
        total += p.total;
      };
      if (opt.subOptions?.length) add(groupProgress(a, base, opt.subOptions, opt.subOptionsExclusive ?? false));
      if (opt.secondaryOptions?.length) add(groupProgress(a, `${base}::secondary`, opt.secondaryOptions, opt.secondaryOptionsExclusive ?? false));
      (opt.moreBlocks ?? []).forEach((b, i) => add(groupProgress(a, `${base}::block${i + 3}`, b.options, b.exclusive ?? false)));
    }
    return { done, total };
  }
  return { done: 0, total: 0 };
}

/**
 * Nivel de avance del tema (1–4 cuadritos):
 * 1 = sin responder · 2 = respondida pero falta la mayor parte de sub-opciones o datos · 3 = falta poco (la mayoria hecha) o falta la evidencia ·
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
  if (!states.every((c) => c === "complete")) {
    // Respondida pero incompleta: 3 cuadritos si ya esta la mayoria de los elementos, 2 si falta la mayor parte.
    let done = 0;
    let total = 0;
    core.forEach((el, i) => {
      if (states[i] === "complete") return;
      const p = elementProgress(el, a);
      done += p.done;
      total += p.total;
    });
    return total > 0 && done * 2 > total ? 3 : 2;
  }
  if (evidence.length === 0) return 4;
  return hasEvidence ? 4 : 3;
}

/** Estado del tema como una sola pregunta; null si no tiene nada que responder. Completo = 4 cuadritos. */
export function temaCompletion(elements: FormElement[], a: ResponseAnswers): Completion | null {
  const level = temaLevel(elements, a);
  if (level === null) return null;
  return level === 4 ? "complete" : level === 1 ? "empty" : "partial";
}
