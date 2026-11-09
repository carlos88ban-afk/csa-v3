import {
  componentRegistry,
  naKey,
  type EvaluationSnapshot,
  type FormElement,
  type ResponseAnswers,
  splitAnswerText,
} from "@plataforma-csa/sdk-core";
import { formatAnswer } from "@/lib/evaluation-export";

// Capa de consolidacion: reglas por tipo de pregunta, calculadas siempre desde
// las respuestas de cada unidad (fuente de verdad).
//   numero            -> suma
//   Si/No             -> Sí si alguna unidad responde Sí
//   texto             -> todos los sustentos, con la sigla de la unidad
//   evidencia / URL   -> todos los archivos / enlaces, con la sigla
//   otras selecciones -> conteo de unidades por opcion
//   tabla / calculado -> detalle por unidad (no se agrega)

export interface UnitRef {
  id: string;
  name: string;
  sigla: string | null;
}

export interface ConsolidatedRow {
  subindicatorId: string;
  dimension: string;
  indicator: string;
  block: string;
  question: string;
  type: string;
  rule: string;
  value: string;
  contributions: string;
  answeredUnits: number;
  applicableUnits: number;
}

const QUESTION_TYPES = new Set<string>(componentRegistry.filter((c) => c.isQuestion).map((c) => c.type));

function plain(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

export function consolidateElement(
  el: FormElement,
  entries: Array<{ unit: string; value: unknown; answers: ResponseAnswers }>,
): { rule: string; value: string; contributions: string } {
  const texts = entries.map((e) => ({ unit: e.unit, text: formatAnswer(el, e.value, false, e.answers) })).filter((t) => t.text !== "");
  const contributions = texts.map((t) => `${t.unit}: ${t.text}`).join("\n");
  if (texts.length === 0) return { rule: "", value: "", contributions: "" };

  switch (el.type) {
    case "numero": {
      const nums = entries.map((e) => Number(e.value)).filter((n) => Number.isFinite(n));
      const sum = nums.reduce((a, b) => a + b, 0);
      const unit = "unit" in el && el.unit ? ` ${el.unit}` : "";
      return { rule: "Suma", value: `${Math.round(sum * 1e6) / 1e6}${unit}`, contributions };
    }
    case "seleccion_unica":
    case "seleccion_desplegable": {
      const labels = el.options.map((o) => norm(plain(o.label)));
      const yesNo = labels.length > 0 && labels.every((l) => l === "si" || l === "no");
      if (yesNo) {
        const anyYes = texts.some((t) => norm(plain(t.text)) === "si");
        return { rule: "Sí si alguna unidad responde Sí", value: anyYes ? "Sí" : "No", contributions };
      }
      const counts = new Map<string, number>();
      // El conteo agrupa por la opción elegida; las tablas embebidas van en el detalle por unidad.
      for (const t of texts) {
        const k = plain(splitAnswerText(t.text).lead);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      return {
        rule: "Conteo por opción",
        value: [...counts].map(([k, n]) => `${k}: ${n}`).join("; "),
        contributions,
      };
    }
    case "seleccion_multiple": {
      const all = new Set<string>();
      for (const t of texts) splitAnswerText(t.text).lead.split("; ").forEach((x) => x && all.add(plain(x)));
      return { rule: "Unión de opciones", value: [...all].join("; "), contributions };
    }
    case "texto_corto":
    case "texto_largo":
    case "fecha":
      return { rule: "Sustentos de todas las unidades", value: contributions, contributions };
    case "evidencia":
      return { rule: "Archivos de todas las unidades", value: contributions, contributions };
    case "url_publica":
      return { rule: "Enlaces de todas las unidades", value: contributions, contributions };
    default:
      return { rule: "Ver detalle por unidad", value: "", contributions };
  }
}

type Sub = EvaluationSnapshot["dimensions"][number]["subindicators"][number];

export function buildConsolidation(
  snapshot: EvaluationSnapshot,
  units: UnitRef[],
  responses: Array<{ unitId: string; subindicatorId: string; answers: ResponseAnswers }>,
): ConsolidatedRow[] {
  const bySubUnit = new Map<string, ResponseAnswers>();
  for (const r of responses) bySubUnit.set(`${r.subindicatorId}::${r.unitId}`, r.answers);
  const out: ConsolidatedRow[] = [];

  const visit = (dim: string, ind: string, sub: Sub) => {
    for (const el of sub.formSchema?.elements ?? []) {
      if (!QUESTION_TYPES.has(el.type)) continue;
      const applicable = units.filter((u) => !el.appliesTo || el.appliesTo.includes(u.id));
      const entries: Array<{ unit: string; value: unknown; answers: ResponseAnswers }> = [];
      for (const u of applicable) {
        const answers = bySubUnit.get(`${sub.id}::${u.id}`);
        if (!answers) continue;
        if ((answers[naKey(el.id)] as string | undefined) === "true") continue;
        const value = answers[el.id];
        if (value === undefined || value === null || value === "") continue;
        entries.push({ unit: u.sigla || u.name, value, answers });
      }
      const c = consolidateElement(el, entries);
      out.push({
        subindicatorId: sub.id,
        dimension: dim,
        indicator: ind,
        block: sub.title,
        question: plain(el.label ?? ""),
        type: el.type,
        rule: c.rule,
        value: c.value,
        contributions: c.contributions,
        answeredUnits: entries.length,
        applicableUnits: applicable.length,
      });
    }
  };
  for (const dim of snapshot.dimensions) {
    for (const ind of dim.indicators) for (const sub of ind.subindicators) visit(dim.title, ind.title, sub);
    for (const sub of dim.subindicators) visit(dim.title, "", sub);
  }
  return out;
}
