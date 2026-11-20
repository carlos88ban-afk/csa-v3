import {
  TEMA_STATE_KEY,
  componentRegistry,
  naKey,
  temaCompletion,
  type Evaluation,
  type EvaluationSnapshot,
  type FormElement,
  type ResponseAnswers,
} from "@plataforma-csa/sdk-core";

// VS-081 (docs/slices/VS-081.md): arma, para «Revisar avances», la evaluación y las respuestas que
// ve el admin corporativo: consolidado (todas las unidades como un solo ente) o una unidad.

export interface ReviewUnit {
  id: string;
  name: string;
  sigla: string | null;
  isCorporate?: boolean;
}
export interface ReviewRow {
  unitId: string;
  subindicatorId: string;
  answers: ResponseAnswers;
}
export const CONSOLIDATED = "all";

type Sub = EvaluationSnapshot["dimensions"][number]["subindicators"][number];
const QUESTION_TYPES = new Set<string>(componentRegistry.filter((c) => c.isQuestion).map((c) => c.type));
const label = (u: ReviewUnit) => u.sigla || u.name;

// Unidades: ausente = todas las unidades (no el corporativo). Corporativo: solo si figura.
function applies(el: FormElement, u: ReviewUnit): boolean {
  if (u.isCorporate) return !!el.appliesTo?.includes(u.id);
  return !el.appliesTo || el.appliesTo.includes(u.id);
}
// El tema aplica a la unidad si alguno de sus elementos (que no sea evidencia) le aplica.
function subApplies(sub: Sub, u: ReviewUnit): boolean {
  const els = (sub.formSchema?.elements ?? []).filter((e) => e.type !== "evidencia");
  const probe = els.length > 0 ? els : (sub.formSchema?.elements ?? []);
  return probe.some((e) => applies(e, u));
}

function hasValue(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function mergeSub(sub: Sub, parts: Array<{ unit: ReviewUnit; answers: ResponseAnswers }>): { sub: Sub; answers: ResponseAnswers } {
  const merged: ResponseAnswers = {};
  for (const p of parts) for (const [k, v] of Object.entries(p.answers)) if (!(k in merged) && !k.startsWith("tema::")) merged[k] = v;
  const elements = (sub.formSchema?.elements ?? []).map((el) => {
    if (!QUESTION_TYPES.has(el.type)) return el;
    const entries = parts
      .filter((p) => applies(el, p.unit) && p.answers[naKey(el.id)] !== "true" && hasValue(p.answers[el.id]))
      .map((p) => ({ unit: label(p.unit), value: p.answers[el.id] }));
    if (entries.length === 0) {
      delete merged[el.id];
      return el;
    }
    switch (el.type) {
      case "numero": {
        const nums = entries.map((e) => Number(e.value)).filter((n) => Number.isFinite(n));
        merged[el.id] = Math.round(nums.reduce((a, b) => a + b, 0) * 1e6) / 1e6;
        return el;
      }
      case "texto_corto":
      case "texto_largo":
      case "fecha":
      case "url_publica":
        merged[el.id] = entries.length === 1 ? String(entries[0]!.value) : entries.map((e) => `${e.unit}: ${String(e.value)}`).join("\n");
        return el;
      case "seleccion_multiple":
        merged[el.id] = [...new Set(entries.flatMap((e) => (Array.isArray(e.value) ? (e.value as string[]) : [String(e.value)])))] as never;
        return el;
      case "seleccion_unica":
      case "seleccion_desplegable": {
        const distinct = [...new Set(entries.map((e) => String(e.value)))];
        if (distinct.length === 1) {
          merged[el.id] = entries[0]!.value as never;
          return el;
        }
        // Unidades que marcaron distinto: se muestran todas las opciones marcadas.
        merged[el.id] = distinct as never;
        return { ...el, type: "seleccion_multiple" } as FormElement;
      }
      default: {
        const arrays = entries.filter((e) => Array.isArray(e.value));
        merged[el.id] = (arrays.length === entries.length ? arrays.flatMap((e) => e.value as unknown[]) : entries[0]!.value) as never;
        return el;
      }
    }
  });
  return { sub: { ...sub, formSchema: sub.formSchema ? { ...sub.formSchema, elements } : sub.formSchema } as Sub, answers: merged };
}

function stateFor(elements: FormElement[], answers: ResponseAnswers) {
  return temaCompletion(elements, answers);
}

export interface ReviewView {
  evaluation: Evaluation;
  answers: Record<string, ResponseAnswers>;
}

export function buildReviewView(evaluation: Evaluation, units: ReviewUnit[], rows: ReviewRow[], viewId: string): ReviewView {
  const by = new Map<string, ResponseAnswers>();
  for (const r of rows) by.set(`${r.subindicatorId}::${r.unitId}`, r.answers);
  const answers: Record<string, ResponseAnswers> = {};
  const view = viewId === CONSOLIDATED ? null : (units.find((u) => u.id === viewId) ?? null);

  const handle = (sub: Sub): Sub | null => {
    const applicable = view ? (subApplies(sub, view) ? [view] : []) : units.filter((u) => subApplies(sub, u));
    if (applicable.length === 0) return null;
    if (view) {
      const own = by.get(`${sub.id}::${view.id}`) ?? {};
      const elements = (sub.formSchema?.elements ?? []).filter((e) => applies(e, view));
      answers[sub.id] = { ...own, [TEMA_STATE_KEY]: stateFor(elements, own) ?? "empty" };
      return { ...sub, formSchema: sub.formSchema ? { ...sub.formSchema, elements } : sub.formSchema } as Sub;
    }
    const parts = applicable.map((u) => {
      const a = by.get(`${sub.id}::${u.id}`) ?? {};
      const els = (sub.formSchema?.elements ?? []).filter((e) => applies(e, u));
      return { unit: u, answers: a, state: stateFor(els, a) ?? "empty" };
    });
    const states = parts.map((p) => p.state);
    const state = states.every((s) => s === "complete") ? "complete" : states.every((s) => s === "empty") ? "empty" : "partial";
    const m = mergeSub(sub, parts);
    answers[sub.id] = { ...m.answers, [TEMA_STATE_KEY]: state };
    return m.sub;
  };

  const dimensions = evaluation.snapshot.dimensions
    .map((dim) => ({
      ...dim,
      indicators: dim.indicators
        .map((ind) => ({ ...ind, subindicators: ind.subindicators.map(handle).filter((s): s is Sub => !!s) }))
        .filter((ind) => ind.subindicators.length > 0),
      subindicators: dim.subindicators.map(handle).filter((s): s is Sub => !!s),
    }))
    .filter((d) => d.indicators.length > 0 || d.subindicators.length > 0);
  return { evaluation: { ...evaluation, snapshot: { ...evaluation.snapshot, dimensions } }, answers };
}

/** % de temas completos de una vista (para las pestañas). */
export function viewProgress(view: ReviewView): { complete: number; total: number } {
  let complete = 0;
  let total = 0;
  for (const a of Object.values(view.answers)) {
    total++;
    if (a[TEMA_STATE_KEY] === "complete") complete++;
  }
  return { complete, total };
}
