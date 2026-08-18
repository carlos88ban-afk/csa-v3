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
  type TablaDatosConfig,
} from "@plataforma-csa/sdk-core";

// Motor engine/export v1 (ver docs/engines/export.md). Lógica de
// serialización de respuestas compartida entre el export CSV (VS-012+,
// evaluaciones sin unidades de negocio) y el export XLSX consolidado
// (VS-055, docs/domain/business-units.md "Exportación consolidada",
// evaluaciones en modo corporativo) — extraída de
// app/api/evaluations/[id]/export/route.ts para no duplicar la resolución
// de cada tipo de pregunta (selección con sub-opciones, tabla, evidencia,
// etc.) en dos archivos.

// VS-048 (docs/engines/form.md "Grilla uniforme sin encabezados
// especiales"): el tipo/config de una celda vive siempre en row.cells — sin
// fallback a un "tipo de fila legacy" (ya no existe). Si no hay entrada
// para esta columna, la celda está en blanco — undefined (mismo criterio de
// blank que Runtime/Preview, permite grillas irregulares).
function cellConfig(row: FormTableRow, columnId: string): FormTableCell | undefined {
  return row.cells.find((c) => c.columnId === columnId);
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

// Referencias por opción (VS-039, docs/engines/form.md "Referencias de URL
// por opción"; VS-045 "Referencias flexibles") y por pregunta (VS-056,
// docs/engines/form.md "Referencias a nivel de pregunta"): sufijo del label
// de la opción elegida / de la celda Respuesta, mismo criterio que
// url_publica ("; " join, sin resolución de labels) — no una fila/columna
// nueva, sigue siendo "una fila por Elemento". Con refType flexible un slot
// puede ser URL literal o documento interno, que se serializa
// `[Archivo: {name}]` (el binario no viaja en CSV/XLSX).
function formatOptionReferences(
  references: { maxUrls?: number | undefined; refType?: "public" | "flexible" | undefined } | undefined,
  refsKey: string,
  answers: ResponseAnswers,
): string {
  if (!references) return "";
  const refs = answers[refsKey];
  const slots = Array.isArray(refs) ? refs : [];
  const parts = slots.map((u) =>
    u && typeof u === "object" && "name" in u ? `[Archivo: ${String((u as { name: unknown }).name)}]` : String(u),
  );
  return parts.length > 0 ? ` (Referencias: ${parts.join("; ")})` : "";
}

// Tabla embebida (VS-042 dentro de una sub-opción, VS-060 directo en una
// opción de nivel superior): misma serialización "Fila N: Columna M=..." en
// ambos casos — resuelve labels de columna (posicional, no id — VS-048 no
// tiene label de columna) y unidad por celda vía la clave sintética
// `${tableKey}::${row.id}::${col.id}`. Compartida entre
// `formatSubOptionExtras` (sub.table) y `formatOptionLabel` (opt.table) para
// no duplicar el bloque; el `tabla_datos` suelto en `formatAnswer` tiene
// contrato de retorno distinto y queda sin tocar.
function formatEmbeddedTable(table: TablaDatosConfig, tableKey: string, answers: ResponseAnswers): string | null {
  const tableValue = answers[tableKey];
  if (typeof tableValue !== "object" || tableValue === null || Array.isArray(tableValue)) return null;
  const tableMap = tableValue as Record<string, Record<string, string | number>>;
  const serialized = table.rows
    .map((row, rowIdx) => {
      const rowValue = tableMap[row.id] ?? {};
      const cells = table.columns
        .map((col, colIdx) => {
          const cellCfg = cellConfig(row, col.id);
          if (!cellCfg || (cellCfg.editable === false && cellCfg.cellType !== "calculado")) return null;
          const cell = rowValue[col.id];
          if (cell === undefined || cell === "") return null;
          const unit = cellCfg.availableUnits
            ? ((answers[unitKey(`${tableKey}::${row.id}::${col.id}`)] as string | undefined) ?? cellCfg.availableUnits[0])
            : cellCfg.unit;
          const resolved =
            cellCfg.cellType === "seleccion_desplegable"
              ? (stripCommentHtml(cellCfg.options?.find((o) => o.id === cell)?.label ?? "") || String(cell))
              : cellCfg.cellType === "casilla"
                ? "Sí"
                : String(cell);
          // VS-061: texto revelado de una celda "casilla", misma clave
          // sintética compuesta que la unidad por celda (VS-048).
          const revealed =
            cellCfg.cellType === "casilla" && cellCfg.revealText
              ? (answers[commentKey(`${tableKey}::${row.id}::${col.id}`)] as string | undefined)
              : undefined;
          return `Columna ${colIdx + 1}=${resolved}${unit && cellCfg.cellType === "numero" ? ` ${unit}` : ""}${revealed ? `: ${revealed}` : ""}`;
        })
        .filter((c): c is string => c !== null);
      return cells.length > 0 ? `Fila ${rowIdx + 1}: ${cells.join(", ")}` : null;
    })
    .filter((r): r is string => r !== null)
    .join("; ");
  return serialized.length > 0 ? serialized : null;
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
  // clave sintética `${subOptionKey}::table`.
  if (sub.table) {
    const serialized = formatEmbeddedTable(sub.table, `${subOptionKey}::table`, answers);
    if (serialized) parts.push(`Tabla: ${serialized}`);
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
  let label = `${stripCommentHtml(opt.label)}${formatOptionReferences(opt.references, `${optKey}::refs`, answers)}`;
  // Tabla embebida directo en la opción (VS-060, docs/engines/form.md "Tabla
  // embebida directamente en una opción de nivel superior").
  if (opt.table) {
    const serialized = formatEmbeddedTable(opt.table, `${optKey}::table`, answers);
    if (serialized) label += ` (Tabla: ${serialized})`;
  }
  const subParts = formatMarkedSubOptions(opt.subOptions, optKey, answers);
  const secondaryParts = formatMarkedSubOptions(opt.secondaryOptions, `${optKey}::secondary`, answers);
  const allParts = [...subParts, ...secondaryParts];
  if (allParts.length > 0) label += ` — ${allParts.join("; ")}`;
  return label;
}

function formatAnswer(element: FormElement, value: unknown, markedNA: boolean, answers: ResponseAnswers): string {
  // VS-019 (docs/engines/persistence.md, "N/A + comentario confidencial"):
  // N/A gana sobre cualquier valor residual de un intento anterior — la
  // exportación debe mostrar "N/A" explícito, no una celda vacía
  // indistinguible de "nunca se tocó".
  if (markedNA) return "N/A";
  if (value === undefined || value === null || value === "") return "";
  if (element.type === "seleccion_unica") {
    const opt = element.options.find((o) => o.id === value);
    const resolved = opt ? formatOptionLabel(opt, element.id, answers) : String(value);
    // VS-056: referencias a nivel de pregunta anexadas a la misma celda,
    // después de las de la opción (mismo sufijo " (Referencias: ...)").
    return resolved + formatOptionReferences(element.references, `${element.id}::refs`, answers);
  }
  if (element.type === "seleccion_desplegable") {
    const opt = element.options.find((o) => o.id === value);
    return opt ? stripCommentHtml(opt.label) : String(value);
  }
  if (element.type === "seleccion_multiple") {
    const ids = Array.isArray(value) ? value : [];
    const resolved = ids
      .map((id) => {
        const opt = element.options.find((o) => o.id === id);
        return opt ? formatOptionLabel(opt, element.id, answers) : String(id);
      })
      .join("; ");
    return resolved + formatOptionReferences(element.references, `${element.id}::refs`, answers);
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
  // en una celda plana, se serializa "fila: col1=v1, col2=v2; fila2: ...",
  // resolviendo labels de fila/columna (no ids) y la unidad por fila (mismo
  // criterio que numero suelto, id compuesto element.id::row.id).
  if (element.type === "tabla_datos" && typeof value === "object" && !Array.isArray(value)) {
    const table = value as Record<string, Record<string, string | number>>;
    return element.rows
      .map((row, rowIdx) => {
        const rowValue = table[row.id] ?? {};
        const cells = element.columns
          .map((col, colIdx) => {
            const cellCfg = cellConfig(row, col.id);
            if (!cellCfg || (cellCfg.editable === false && cellCfg.cellType !== "calculado")) return null;
            const cell = rowValue[col.id];
            if (cell === undefined || cell === "") return null;
            const unit = cellCfg.availableUnits
              ? ((answers[unitKey(`${element.id}::${row.id}::${col.id}`)] as string | undefined) ?? cellCfg.availableUnits[0])
              : cellCfg.unit;
            const resolved =
              cellCfg.cellType === "seleccion_desplegable"
                ? (stripCommentHtml(cellCfg.options?.find((o) => o.id === cell)?.label ?? "") || String(cell))
                : cellCfg.cellType === "casilla"
                  ? "Sí"
                  : String(cell);
            // VS-061: texto revelado de una celda "casilla", misma clave
            // sintética compuesta que la unidad por celda (VS-048).
            const revealed =
              cellCfg.cellType === "casilla" && cellCfg.revealText
                ? (answers[commentKey(`${element.id}::${row.id}::${col.id}`)] as string | undefined)
                : undefined;
            return `Columna ${colIdx + 1}=${resolved}${unit && cellCfg.cellType === "numero" ? ` ${unit}` : ""}${revealed ? `: ${revealed}` : ""}`;
          })
          .filter((c): c is string => c !== null);
        return cells.length > 0 ? `Fila ${rowIdx + 1}: ${cells.join(", ")}` : null;
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

export const EXPORT_HEADER = ["Dimensión", "Indicador", "Subindicador", "Número", "Elemento", "Tipo", "Respuesta", "Estado", "Comentario confidencial"];

// Extraído para reusarse en dos sitios: Subindicadores bajo Indicador y
// Subindicadores directos bajo Dimensión (VS-029, docs/domain/evaluation-hierarchy.md)
// — "Indicador" queda "" para los directos, una celda vacía ya comunica "no
// aplica" sin ambigüedad, mismo criterio que el resto de la exportación.
function subindicatorRows(dimTitle: string, indTitle: string, sub: SnapshotSubindicator, answers: ResponseAnswers): string[][] {
  // Elementos ocultos por visibleIf (docs/engines/rule.md) no se exportan —
  // nunca se le pidieron al evaluado. Elementos EXCLUIDOS para una unidad de
  // negocio (VS-050/053) ya no están en sub.formSchema.elements cuando el
  // snapshot pasado acá viene filtrado (ver getEvaluationForBusinessUnit) —
  // esta función no necesita saber nada de exclusiones, solo recorre lo que
  // el snapshot le da.
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

/**
 * Todas las filas de datos (sin encabezado) de un snapshot completo, en el
 * mismo orden que el árbol Dimensión→Indicador→Subindicador (+ directos).
 * Compartido por el export CSV (`export/route.ts`) y el export XLSX
 * consolidado (VS-055).
 */
export function buildExportRows(snapshot: EvaluationSnapshot, answersBySub: Map<string, ResponseAnswers>): string[][] {
  const rows: string[][] = [];
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
  return rows;
}

export function sanitizeExportFilename(title: string): string {
  return title.replace(/[^a-zA-Z0-9\-_ ]/g, "").trim().replace(/\s+/g, "-") || "evaluacion";
}
