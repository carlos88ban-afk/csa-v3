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
  stripCommentHtml,
  unitKey,
  type EvaluationSnapshot,
  type FormElement,
  type FormTableCell,
  type FormTableRow,
  type ResponseAnswers,
} from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

// VS-044 (docs/engines/form.md "Tipo de celda mixto dentro de una fila"):
// el tipo/config de una celda se resuelve por override (row.cells) y cae al
// atajo legacy de la fila si no hay override — misma resolución que
// Runtime/Preview, compartida por tabla_datos y tabla embebida. VS-047
// (docs/engines/form.md "Editor de tabla_datos estilo grilla"): si la fila
// está en modo celdas (sin cellType propio) y no hay override para esta
// columna, no hay celda — undefined (mismo criterio de blank que
// Runtime/Preview, permite grillas irregulares).
function cellConfig(row: FormTableRow, columnId: string): FormTableCell | undefined {
  const override = row.cells?.find((c) => c.columnId === columnId);
  if (override) return override;
  if (row.cellType === undefined) return undefined;
  return {
    columnId,
    cellType: row.cellType,
    editable: true,
    unit: row.unit,
    availableUnits: row.availableUnits,
    options: row.options,
    maxLength: row.maxLength,
  };
}

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

// Referencias por opción (VS-039, docs/engines/form.md "Referencias de URL
// por opción"; VS-045 "Referencias flexibles"): sufijo del label de la
// opción elegida, mismo criterio que url_publica ("; " join, sin resolución
// de labels) — no una fila/columna nueva, sigue siendo "una fila por
// Elemento". Con refType flexible un slot puede ser URL literal o documento
// interno, que se serializa `[Archivo: {name}]` (el binario no viaja en
// CSV).
function formatOptionReferences(
  opt: { id: string; references?: { maxUrls?: number | undefined; refType?: "public" | "flexible" | undefined } | undefined },
  refsKey: string,
  answers: ResponseAnswers,
): string {
  if (!opt.references) return "";
  const refs = answers[refsKey];
  const slots = Array.isArray(refs) ? refs : [];
  const parts = slots.map((u) =>
    u && typeof u === "object" && "name" in u ? `[Archivo: ${String((u as { name: unknown }).name)}]` : String(u),
  );
  return parts.length > 0 ? ` (Referencias: ${parts.join("; ")})` : "";
}

type SeleccionOption = Extract<FormElement, { type: "seleccion_unica" }>["options"][number];
type SubOptionNode = NonNullable<SeleccionOption["subOptions"]>[number];

// Campos embebidos en sub-opciones (VS-040, docs/engines/form.md "Campos
// embebidos en sub-opciones"): resuelve el valor del field (label si es
// seleccion_desplegable, literal si es texto/número) + las references de la
// sub-opción marcada, mismo criterio de sufijo que formatOptionReferences.
function formatSubOptionExtras(sub: SubOptionNode, subOptionKey: string, answers: ResponseAnswers): string {
  const parts: string[] = [];
  if (sub.field) {
    const raw = answers[`${subOptionKey}::field`];
    if (raw !== undefined && raw !== "") {
      const resolved =
        sub.field.type === "seleccion_desplegable" ? (sub.field.options.find((o) => o.id === raw)?.label ?? String(raw)) : String(raw);
      const unit = sub.field.type === "numero" && sub.field.unit ? ` ${sub.field.unit}` : "";
      parts.push(`${resolved}${unit}`);
    }
  }
  if (sub.references) {
    const refs = answers[`${subOptionKey}::refs`];
    const slots = Array.isArray(refs) ? refs : [];
    const refParts = slots.map((u) =>
      u && typeof u === "object" && "name" in u ? `[Archivo: ${String((u as { name: unknown }).name)}]` : String(u),
    );
    if (refParts.length > 0) parts.push(`Referencias: ${refParts.join("; ")}`);
  }
  // Tabla embebida en una sub-opción (VS-042, docs/engines/form.md "Tabla
  // dentro de una sub-opción"): misma serialización que tabla_datos, con la
  // clave sintética `${subOptionKey}::table` y unidades por fila
  // `${subOptionKey}::table::${row.id}` — sigue siendo "una fila por
  // Elemento", se anexa a la celda Respuesta.
  if (sub.table) {
    const table = sub.table;
    const tableValue = answers[`${subOptionKey}::table`];
    if (typeof tableValue === "object" && !Array.isArray(tableValue)) {
      const tableMap = tableValue as Record<string, Record<string, string | number>>;
      const serialized = table.rows
        .map((row) => {
          const rowValue = tableMap[row.id] ?? {};
          const cells = table.columns
            .map((col) => {
              const cellCfg = cellConfig(row, col.id);
              if (!cellCfg || (cellCfg.editable === false && cellCfg.cellType !== "calculado")) return null;
              const cell = rowValue[col.id];
              if (cell === undefined || cell === "") return null;
              const unit = cellCfg.availableUnits
                ? row.availableUnits
                  ? ((answers[unitKey(`${subOptionKey}::table::${row.id}`)] as string | undefined) ?? cellCfg.availableUnits[0])
                  : cellCfg.availableUnits[0]
                : cellCfg.unit;
              const resolved =
                cellCfg.cellType === "seleccion_desplegable" ? (stripCommentHtml(cellCfg.options?.find((o) => o.id === cell)?.label ?? "") || String(cell)) : String(cell);
              return `${stripCommentHtml(col.label)}=${resolved}${unit && cellCfg.cellType === "numero" ? ` ${unit}` : ""}`;
            })
            .filter((c): c is string => c !== null);
          return cells.length > 0 ? `${stripCommentHtml(row.label)}: ${cells.join(", ")}` : null;
        })
        .filter((r): r is string => r !== null)
        .join("; ");
      if (serialized.length > 0) parts.push(`Tabla: ${serialized}`);
    }
  }
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

// Resuelve una opción elegida (seleccion_unica/multiple) a su label, con las
// references propias de la opción y, si tiene sub-opciones marcadas, las
// sub-opciones elegidas con sus propios field/references (VS-039/VS-040) —
// sigue siendo "una fila por Elemento" (ver export.md), todo se anexa a la
// misma celda Respuesta.
// VS-046 (docs/engines/form.md "Bloque secundario de sub-opciones por
// opción"): mismo shape/resolución que `subOptions`, factorizado para no
// duplicar la lectura de value (radio vs. checkbox) ni el mapeo a labels.
function formatMarkedSubOptions(subOptions: SubOptionNode[] | undefined, key: string, answers: ResponseAnswers): string[] {
  if (!subOptions || subOptions.length === 0) return [];
  const subValue = answers[key];
  const selectedSubIds = Array.isArray(subValue)
    ? subValue.filter((v): v is string => typeof v === "string")
    : typeof subValue === "string"
      ? [subValue]
      : [];
  return selectedSubIds
    .map((subId) => {
      const sub = subOptions.find((s) => s.id === subId);
      return sub ? `${stripCommentHtml(sub.label)}${formatSubOptionExtras(sub, `${key}::${subId}`, answers)}` : null;
    })
    .filter((s): s is string => s !== null);
}

function formatOptionLabel(opt: SeleccionOption, elementId: string, answers: ResponseAnswers): string {
  const optKey = `${elementId}::${opt.id}`;
  let label = `${stripCommentHtml(opt.label)}${formatOptionReferences(opt, `${optKey}::refs`, answers)}`;
  const subParts = formatMarkedSubOptions(opt.subOptions, optKey, answers);
  const secondaryParts = formatMarkedSubOptions(opt.secondaryOptions, `${optKey}::secondary`, answers);
  const allParts = [...subParts, ...secondaryParts];
  if (allParts.length > 0) label += ` — ${allParts.join("; ")}`;
  return label;
}

function formatAnswer(element: FormElement, value: unknown, markedNA: boolean, answers: ResponseAnswers): string {
  // VS-019 (docs/engines/persistence.md, "N/A + comentario confidencial"):
  // N/A gana sobre cualquier valor residual de un intento anterior — el CSV
  // debe mostrar "N/A" explícito, no una celda vacía indistinguible de
  // "nunca se tocó".
  if (markedNA) return "N/A";
  if (value === undefined || value === null || value === "") return "";
  if (element.type === "seleccion_unica") {
    const opt = element.options.find((o) => o.id === value);
    return opt ? formatOptionLabel(opt, element.id, answers) : String(value);
  }
  if (element.type === "seleccion_desplegable") {
    const opt = element.options.find((o) => o.id === value);
    return opt ? stripCommentHtml(opt.label) : String(value);
  }
  if (element.type === "seleccion_multiple") {
    const ids = Array.isArray(value) ? value : [];
    return ids
      .map((id) => {
        const opt = element.options.find((o) => o.id === id);
        return opt ? formatOptionLabel(opt, element.id, answers) : String(id);
      })
      .join("; ");
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
  // Tabla de datos (VS-024, docs/engines/form.md "Tabla de datos"): no cabe
  // en una celda CSV plana, se serializa "fila: col1=v1, col2=v2; fila2: ...",
  // resolviendo labels de fila/columna (no ids) y la unidad por fila (mismo
  // criterio que numero suelto, id compuesto element.id::row.id).
  if (element.type === "tabla_datos" && typeof value === "object" && !Array.isArray(value)) {
    const table = value as Record<string, Record<string, string | number>>;
    return element.rows
      .map((row) => {
        const rowValue = table[row.id] ?? {};
        const cells = element.columns
          .map((col) => {
            const cellCfg = cellConfig(row, col.id);
            if (!cellCfg || (cellCfg.editable === false && cellCfg.cellType !== "calculado")) return null;
            const cell = rowValue[col.id];
            if (cell === undefined || cell === "") return null;
            const unit = cellCfg.availableUnits
              ? row.availableUnits
                ? ((answers[unitKey(`${element.id}::${row.id}`)] as string | undefined) ?? cellCfg.availableUnits[0])
                : cellCfg.availableUnits[0]
              : cellCfg.unit;
            const resolved =
              cellCfg.cellType === "seleccion_desplegable" ? (stripCommentHtml(cellCfg.options?.find((o) => o.id === cell)?.label ?? "") || String(cell)) : String(cell);
            return `${stripCommentHtml(col.label)}=${resolved}${unit && cellCfg.cellType === "numero" ? ` ${unit}` : ""}`;
          })
          .filter((c): c is string => c !== null);
        return cells.length > 0 ? `${stripCommentHtml(row.label)}: ${cells.join(", ")}` : null;
      })
      .filter((r): r is string => r !== null)
      .join("; ");
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

type SnapshotSubindicator = EvaluationSnapshot["dimensions"][number]["indicators"][number]["subindicators"][number];

// Extraído para reusarse en dos sitios: Subindicadores bajo Indicador y
// Subindicadores directos bajo Dimensión (VS-029, docs/domain/evaluation-hierarchy.md)
// — "Indicador" queda "" para los directos, una celda vacía ya comunica "no
// aplica" sin ambigüedad, mismo criterio que el resto del CSV.
function subindicatorRows(
  dimTitle: string,
  indTitle: string,
  sub: SnapshotSubindicator,
  answers: ResponseAnswers,
): string[][] {
  // Elementos ocultos por visibleIf (docs/engines/rule.md) no se exportan —
  // nunca se le pidieron al evaluado.
  const questions = (sub.formSchema?.elements ?? []).filter((el) => isQuestion(el) && isElementVisible(el.visibleIf, answers));
  return questions.map((el, qIndex) => {
    const na = answers[naKey(el.id)] as string | undefined;
    const markedNA = na === "true";
    const derived = deriveStatus(answers[statusKey(el.id)] as string | undefined, isAnswered(answers[el.id], na));
    return [
      dimTitle,
      indTitle,
      sub.title,
      questionNumber(qIndex),
      stripCommentHtml(el.label) || "(sin texto)",
      componentRegistry.find((c) => c.type === el.type)?.label ?? el.type,
      formatAnswer(el, answers[el.id], markedNA, answers),
      STATUS_LABEL[derived],
      stripCommentHtml((answers[commentKey(el.id)] as string | undefined) ?? ""),
    ];
  });
}

function buildCsv(snapshot: EvaluationSnapshot, answersBySub: Map<string, ResponseAnswers>): string {
  const header = ["Dimensión", "Indicador", "Subindicador", "Número", "Elemento", "Tipo", "Respuesta", "Estado", "Comentario confidencial"];
  const rows = [header];

  snapshot.dimensions.forEach((dim) => {
    dim.indicators.forEach((ind) => {
      ind.subindicators.forEach((sub) => {
        rows.push(...subindicatorRows(dim.title, ind.title, sub, answersBySub.get(sub.id) ?? {}));
      });
    });
    // Subindicadores directos (VS-029): sin Indicador intermedio, columna
    // "Indicador" vacía.
    dim.subindicators.forEach((sub) => {
      rows.push(...subindicatorRows(dim.title, "", sub, answersBySub.get(sub.id) ?? {}));
    });
  });

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
