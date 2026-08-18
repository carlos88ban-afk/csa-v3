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

// VS-069 (docs/engines/form.md "Referencias y campos adicionales por
// celda"): reemplaza `resolveRevealField` (VS-065, singular, exclusivo de
// "casilla") — resuelve `cellCfg.extraFields` (array) bajo la clave
// sintética `${prefix}::field::${index}` (mismo tipo `subOptionField` que
// sub.field/opt.field, misma resolución: label si es seleccion_desplegable,
// valor literal + unidad si es numero/texto_corto). Sin distinción por
// cellType: si el campo no se llenó (casilla sin marcar, o simplemente
// vacío), su clave nunca se escribió en Runtime y `raw` es `undefined` — el
// gating ya ocurrió en el momento de guardar, acá solo se lee lo que haya.
// Compartida entre las 2 llamadas (tabla embebida y tabla_datos suelto).
function resolveExtraFields(cellCfg: FormTableCell, prefix: string, answers: ResponseAnswers): string | undefined {
  if (!cellCfg.extraFields || cellCfg.extraFields.length === 0) return undefined;
  const parts = cellCfg.extraFields
    .map((field, index) => {
      const raw = answers[`${prefix}::field::${index}`];
      if (raw === undefined || raw === "") return null;
      const resolved =
        field.type === "seleccion_desplegable" ? (field.options.find((o) => o.id === raw)?.label ?? String(raw)) : String(raw);
      const unit = field.type === "numero" && field.unit ? ` ${field.unit}` : "";
      return field.label ? `${field.label} ${resolved}${unit}` : `${resolved}${unit}`;
    })
    .filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(", ") : undefined;
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
function formatReferenceSlots(refsKey: string, answers: ResponseAnswers): string[] {
  const refs = answers[refsKey];
  const slots = Array.isArray(refs) ? refs : [];
  return slots.map((u) =>
    u && typeof u === "object" && "name" in u ? `[Archivo: ${String((u as { name: unknown }).name)}]` : String(u),
  );
}

function formatOptionReferences(
  references: { maxUrls?: number | undefined; refType?: "public" | "flexible" | undefined } | undefined,
  refsKey: string,
  answers: ResponseAnswers,
): string {
  if (!references) return "";
  const parts = formatReferenceSlots(refsKey, answers);
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
          // VS-067 (docs/engines/form.md "Adjuntar archivos o enlaces por
          // celda"): una celda "referencia" no guarda valor propio en
          // `rowValue[col.id]` (a diferencia de numero/texto/casilla) — el
          // slot de referencias vive bajo `::refs`, se resuelve antes del
          // check `cell === undefined` de abajo (que la saltaría siempre).
          if (cellCfg.cellType === "referencia") {
            const parts = formatReferenceSlots(`${tableKey}::${row.id}::${col.id}::refs`, answers);
            return parts.length > 0 ? `Columna ${colIdx + 1}=${parts.join("; ")}` : null;
          }
          const cell = rowValue[col.id];
          if (cell === undefined || cell === "") return null;
          const cellPrefix = `${tableKey}::${row.id}::${col.id}`;
          const unit = cellCfg.availableUnits
            ? ((answers[unitKey(cellPrefix)] as string | undefined) ?? cellCfg.availableUnits[0])
            : cellCfg.unit;
          const resolved =
            cellCfg.cellType === "seleccion_desplegable"
              ? (stripCommentHtml(cellCfg.options?.find((o) => o.id === cell)?.label ?? "") || String(cell))
              : cellCfg.cellType === "casilla"
                ? "Sí"
                : String(cell);
          // VS-069: campo(s) adicionales de la celda — mismo tipo
          // (`subOptionField[]`) y misma resolución que sub.field/opt.field,
          // clave sintética `${cellPrefix}::field::${index}`.
          const extras = resolveExtraFields(cellCfg, cellPrefix, answers);
          // VS-069 (docs/engines/form.md "Referencias y campos adicionales
          // por celda"): `references` ya no exclusivo de cellType
          // "referencia" — se anexa como sufijo cuando una celda con
          // control principal propio también tiene referencias adjuntas.
          const refParts = cellCfg.references ? formatReferenceSlots(`${cellPrefix}::refs`, answers) : [];
          const refsSuffix = refParts.length > 0 ? ` [Referencias: ${refParts.join("; ")}]` : "";
          return `Columna ${colIdx + 1}=${resolved}${unit && cellCfg.cellType === "numero" ? ` ${unit}` : ""}${extras ? `: ${extras}` : ""}${refsSuffix}`;
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
  // VS-068 (docs/engines/form.md "Exclusividad y encabezado del bloque
  // primario de sub-opciones"): sub-sub-opciones marcadas (nivel 2,
  // `sub.subOptions`) — hallazgo real (COG_ESGGovernanceOversight_Selection):
  // una sub-opción tipo checkbox revela su propio grupo de radios al
  // marcarse, y hasta ahora el export nunca lo resolvía (solo
  // `formatMarkedSubOptions` a nivel 1, nunca recursaba). Reusa la misma
  // función — genérica sobre radio (string) vs checkbox (array) — bajo la
  // MISMA clave `subOptionKey` que usa la recursión de Runtime
  // (`SubOptionsView subKey={`${subKey}::${sub.id}`}`).
  if (sub.subOptions && sub.subOptions.length > 0) {
    const nested = formatMarkedSubOptions(sub.subOptions, subOptionKey, answers);
    if (nested.length > 0) parts.push(`Sub-opciones: ${nested.join("; ")}`);
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
  // Campo embebido directo en la opción (VS-062, docs/engines/form.md "Campo
  // embebido directo en una opción de nivel superior") — misma resolución
  // que formatSubOptionExtras para sub.field, un nivel menos de anidación.
  if (opt.field) {
    const raw = answers[`${optKey}::field`];
    if (raw !== undefined && raw !== "") {
      const resolvedField =
        opt.field.type === "seleccion_desplegable" ? (opt.field.options.find((o) => o.id === raw)?.label ?? String(raw)) : String(raw);
      const fieldUnit = opt.field.type === "numero" && opt.field.unit ? ` ${opt.field.unit}` : "";
      label += ` (${resolvedField}${fieldUnit})`;
    }
  }
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
            // VS-067: ver nota equivalente en formatEmbeddedTable arriba.
            if (cellCfg.cellType === "referencia") {
              const parts = formatReferenceSlots(`${element.id}::${row.id}::${col.id}::refs`, answers);
              return parts.length > 0 ? `Columna ${colIdx + 1}=${parts.join("; ")}` : null;
            }
            const cell = rowValue[col.id];
            if (cell === undefined || cell === "") return null;
            const cellPrefix = `${element.id}::${row.id}::${col.id}`;
            const unit = cellCfg.availableUnits
              ? ((answers[unitKey(cellPrefix)] as string | undefined) ?? cellCfg.availableUnits[0])
              : cellCfg.unit;
            const resolved =
              cellCfg.cellType === "seleccion_desplegable"
                ? (stripCommentHtml(cellCfg.options?.find((o) => o.id === cell)?.label ?? "") || String(cell))
                : cellCfg.cellType === "casilla"
                  ? "Sí"
                  : String(cell);
            // VS-069: campo(s) adicionales y referencias — ver nota
            // equivalente en formatEmbeddedTable arriba.
            const extras = resolveExtraFields(cellCfg, cellPrefix, answers);
            const refParts = cellCfg.references ? formatReferenceSlots(`${cellPrefix}::refs`, answers) : [];
            const refsSuffix = refParts.length > 0 ? ` [Referencias: ${refParts.join("; ")}]` : "";
            return `Columna ${colIdx + 1}=${resolved}${unit && cellCfg.cellType === "numero" ? ` ${unit}` : ""}${extras ? `: ${extras}` : ""}${refsSuffix}`;
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
