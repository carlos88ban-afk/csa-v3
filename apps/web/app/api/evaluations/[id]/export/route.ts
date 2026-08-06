import { getEvaluation, listResponses, requireActiveMember } from "@plataforma-csa/db";
import {
  commentKey,
  componentRegistry,
  deriveStatus,
  isAnswered,
  isElementVisible,
  naKey,
  questionNumber,
  statusKey,
  unitKey,
  type EvaluationSnapshot,
  type FormElement,
  type ResponseAnswers,
} from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

// Motor engine/export v1 (ver docs/engines/export.md). Autenticado y
// tenant-scoped (a diferencia de persistence.md/evidences.md): exportar es
// una acción de revisión del administrador sobre datos de su propia
// Organización, no algo que el evaluado (sin cuenta) necesite hacer.

interface Params {
  params: Promise<{ id: string }>;
}

type QuestionComponentType = Extract<(typeof componentRegistry)[number], { isQuestion: true }>["type"];
const QUESTION_TYPES = new Set<QuestionComponentType>(
  componentRegistry
    .filter((c): c is Extract<(typeof componentRegistry)[number], { isQuestion: true }> => c.isQuestion)
    .map((c) => c.type),
);
function isQuestion(el: FormElement): boolean {
  return QUESTION_TYPES.has(el.type as QuestionComponentType);
}

// RFC 4180: comillas alrededor de cualquier valor con coma, comilla o salto
// de línea; las comillas internas se duplican. Sin librería — es una función
// de pocas líneas, no justifica una dependencia nueva (NFR-3).
function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function formatAnswer(element: FormElement, value: unknown, markedNA: boolean, answers: ResponseAnswers): string {
  // VS-019 (docs/engines/persistence.md, "N/A + comentario confidencial"):
  // N/A gana sobre cualquier valor residual de un intento anterior — el CSV
  // debe mostrar "N/A" explícito, no una celda vacía indistinguible de
  // "nunca se tocó".
  if (markedNA) return "N/A";
  if (value === undefined || value === null || value === "") return "";
  if (element.type === "seleccion_unica" || element.type === "seleccion_desplegable") {
    const opt = element.options.find((o) => o.id === value);
    return opt?.label ?? String(value);
  }
  if (element.type === "seleccion_multiple") {
    const ids = Array.isArray(value) ? value : [];
    return ids.map((id) => element.options.find((o) => o.id === id)?.label ?? String(id)).join("; ");
  }
  if (element.type === "evidencia") {
    const refs = Array.isArray(value) ? value : [];
    return refs.map((ref) => (ref && typeof ref === "object" && "name" in ref ? String(ref.name) : "")).join("; ");
  }
  if (element.type === "url_publica") {
    const urls = Array.isArray(value) ? value : [];
    return urls.map((url) => String(url)).join("; ");
  }
  // Unidad por campo numérico (VS-023, docs/engines/form.md): unidad elegida
  // (clave sintética unitKey) si hay availableUnits + respuesta de unidad, si
  // no la unidad fija `unit`, si no ninguna — mismo formato en los 3 casos.
  if (element.type === "numero" && (element.unit || element.availableUnits)) {
    const unit = (answers[unitKey(element.id)] as string | undefined) ?? element.availableUnits?.[0] ?? element.unit;
    return unit ? `${String(value)} ${unit}` : String(value);
  }
  return String(value);
}

// VS-018 (docs/engines/persistence.md, "Estado por pregunta"): mismo
// deriveStatus que Runtime/Revisión, aplicado sobre el mismo mapa `answers`
// ya disponible acá.
const STATUS_LABEL: Record<ReturnType<typeof deriveStatus>, string> = {
  not_started: "Sin iniciar",
  in_progress: "En progreso",
  completed: "Completado",
  approved: "Aprobado",
  submitted: "Enviado",
};

function buildCsv(snapshot: EvaluationSnapshot, answersBySub: Map<string, ResponseAnswers>): string {
  const header = ["Dimensión", "Indicador", "Subindicador", "Número", "Elemento", "Tipo", "Respuesta", "Estado", "Comentario confidencial"];
  const rows = [header];

  for (const dim of snapshot.dimensions) {
    for (const ind of dim.indicators) {
      for (const sub of ind.subindicators) {
        const answers = answersBySub.get(sub.id) ?? {};
        // Elementos ocultos por visibleIf (docs/engines/rule.md) no se
        // exportan — nunca se le pidieron al evaluado.
        const questions = (sub.formSchema?.elements ?? []).filter(
          (el) => isQuestion(el) && isElementVisible(el.visibleIf, answers),
        );
        questions.forEach((el, qIndex) => {
          const na = answers[naKey(el.id)] as string | undefined;
          const markedNA = na === "true";
          const derived = deriveStatus(answers[statusKey(el.id)] as string | undefined, isAnswered(answers[el.id], na));
          rows.push([
            dim.title,
            ind.title,
            sub.title,
            questionNumber(qIndex),
            el.label || "(sin texto)",
            componentRegistry.find((c) => c.type === el.type)?.label ?? el.type,
            formatAnswer(el, answers[el.id], markedNA, answers),
            STATUS_LABEL[derived],
            (answers[commentKey(el.id)] as string | undefined) ?? "",
          ]);
        });
      }
    }
  }

  const body = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return `﻿${body}`;
}

function sanitizeFilename(title: string): string {
  return title.replace(/[^a-zA-Z0-9\-_ ]/g, "").trim().replace(/\s+/g, "-") || "evaluacion";
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireActiveMember(request.headers);
    const evaluation = await getEvaluation(organizationId, id);
    if (!evaluation) return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });

    const responses = await listResponses(evaluation.id);
    const answersBySub = new Map(responses.map((r) => [r.subindicatorId, r.answers as ResponseAnswers]));
    const csv = buildCsv(evaluation.snapshot as EvaluationSnapshot, answersBySub);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${sanitizeFilename(evaluation.title)}.csv"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
