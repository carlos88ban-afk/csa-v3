"use client";

import {
  componentRegistry,
  evaluateExpression,
  evaluateTableExpression,
  isElementVisible,
  questionNumber,
  sanitizeCommentHtml,
  stripCommentHtml,
  type AnswerValue,
  type EvidenceRef,
  type FormElement,
  type ResponseAnswers,
  type TablaDatosConfig,
  type TableValue,
} from "@plataforma-csa/sdk-core";
import { useEffect, useMemo, useState } from "react";
import { Pill } from "@/components/ui";
import { RichLabel } from "@/components/rich-label";

// Vista previa en vivo del formulario tal como lo ve el evaluado (VS-032,
// docs/slices/VS-032.md contrato 5). Sin acceso a red: respuestas en memoria
// y render propio por tipo — reutiliza la lógica pura de sdk-core
// (isElementVisible, evaluateExpression, questionNumber). Las evidencias se
// muestran como slots vacíos (sin R2 en el editor); no hay autosave ni
// estado N/A/comentarios: el preview es solo de forma.

type QuestionComponentType = Extract<(typeof componentRegistry)[number], { isQuestion: true }>["type"];

const QUESTION_TYPES = new Set<QuestionComponentType>(
  componentRegistry.filter((c): c is Extract<(typeof componentRegistry)[number], { isQuestion: true }> => c.isQuestion).map((c) => c.type),
);

function isQuestion(el: FormElement): el is Extract<FormElement, { type: QuestionComponentType }> {
  return QUESTION_TYPES.has(el.type as QuestionComponentType);
}

const UNIT_KEY = "::unit";

interface Props {
  elements: FormElement[];
}

export function FormPreview({ elements }: Props) {
  const [answers, setAnswers] = useState<ResponseAnswers>({});
  const [showAll, setShowAll] = useState(false);

  const visible = useMemo(
    () => elements.filter((el) => showAll || isElementVisible(el.visibleIf, answers)),
    // showAll no participa del memo: cuando está activo el predicado ignora
    // `answers`, y el estado interno ya fuerza re-render al cambiar.
    [elements, answers, showAll],
  );

  function setAnswer(id: string, value: AnswerValue | undefined) {
    setAnswers((prev) => {
      const next = { ...prev };
      if (
        value === undefined ||
        value === "" ||
        (Array.isArray(value) && value.length === 0) ||
        (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)
      ) {
        delete next[id];
      } else {
        next[id] = value;
      }
      return next;
    });
  }

  let questionIndex = 0;

  function numbered(el: FormElement): string | undefined {
    if (!isQuestion(el) || (!showAll && !isElementVisible(el.visibleIf, answers))) return undefined;
    const number = questionNumber(questionIndex);
    questionIndex += 1;
    return number;
  }

  return (
    <div className="form-preview">
      <div className="form-preview__toolbar">
        <p className="form-preview__hint">Así verá el/la evaluado/a este subindicador. Los cambios se reflejan al instante.</p>
        <label className="field field--checkbox">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Mostrar todos (ignorar condiciones)
        </label>
      </div>
      {visible.length === 0 ? (
        <p className="empty">Sin elementos visibles todavía.</p>
      ) : (
        <div className="form-preview__list">
          {visible.map((el) => (
            <PreviewElement
              key={el.id}
              element={el}
              number={numbered(el)}
              answers={answers}
              onChange={(value) => setAnswer(el.id, value)}
              onAnswerChange={(key, value) => setAnswer(key, value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewElement({
  element,
  number,
  answers,
  onChange,
  onAnswerChange,
}: {
  element: FormElement;
  number: string | undefined;
  answers: ResponseAnswers;
  onChange: (value: AnswerValue) => void;
  onAnswerChange: (key: string, value: AnswerValue) => void;
}) {
  if (element.type === "instruccion") {
    return (
      <p className="runtime-instruction">
        <RichLabel html={element.label} />
      </p>
    );
  }

  if (element.type === "banner") {
    return <PreviewBanner element={element} />;
  }

  if (element.type === "calculado") {
    return <PreviewCalculado element={element} number={number} answers={answers} />;
  }

  const label = (
    <span className="field__label">
      {number && `${number} `}
      <RichLabel html={element.label} fallback={<em>(sin texto)</em>} /> {element.required && <Pill variant="warn">obligatorio</Pill>}
    </span>
  );

  if (element.type === "url_publica") {
    return (
      <fieldset className="field runtime-question">
        <legend>{label}</legend>
        {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}
        <PreviewUrlList
          maxUrls={element.maxUrls ?? 3}
          value={answers[element.id]}
          onChange={(next) => onChange(next)}
          className="runtime-url-list"
        />
      </fieldset>
    );
  }

  if (element.type === "evidencia") {
    return (
      <fieldset className="field runtime-question">
        <legend>{label}</legend>
        {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}
        <div className="form-preview__evidence-slot">Evidencia no disponible en el editor — se sube en la evaluación.</div>
      </fieldset>
    );
  }

  if (element.type === "tabla_datos") {
    const table = (answers[element.id] as TableValue | undefined) ?? {};
    return (
      <fieldset className="field runtime-question">
        <legend>{label}</legend>
        {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}
        <PreviewTableView
          label={element.label}
          unitKeyPrefix={element.id}
          columns={element.columns}
          rows={element.rows}
          table={table}
          answers={answers}
          onAnswerChange={onAnswerChange}
          onChange={onChange}
        />
      </fieldset>
    );
  }

  if (element.type === "seleccion_desplegable") {
    const value = (answers[element.id] as string | undefined) ?? "";
    return (
      <div className="field runtime-question">
        <label className="field">
          <span className="field__label">{label}</span>
          {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}
          <select value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">Seleccionar…</option>
            {element.options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {stripCommentHtml(opt.label)}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  if (element.type === "texto_corto" || element.type === "texto_largo" || element.type === "numero") {
    const value = answers[element.id];
    return (
      <div className="field runtime-question">
        <label className="field">
          <span className="field__label">{label}</span>
          {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}
          {element.type === "texto_corto" && (
            <input value={(value as string) ?? ""} maxLength={element.maxLength} onChange={(e) => onChange(e.target.value)} />
          )}
          {element.type === "texto_largo" && (
            <textarea
              value={(value as string) ?? ""}
              maxLength={element.maxLength}
              rows={4}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
          {element.type === "numero" && (
            <span className="runtime-question__number-with-unit">
              <input
                type="number"
                value={value === undefined ? "" : (value as number)}
                min={element.min}
                max={element.max}
                onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
              />
              {element.availableUnits && element.availableUnits.length > 0 ? (
                <select
                  value={(answers[`${element.id}${UNIT_KEY}`] as string | undefined) ?? element.availableUnits[0]}
                  onChange={(e) => onAnswerChange(`${element.id}${UNIT_KEY}`, e.target.value)}
                >
                  {element.availableUnits.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              ) : (
                element.unit && <span className="runtime-question__unit">{element.unit}</span>
              )}
            </span>
          )}
        </label>
      </div>
    );
  }

  // seleccion_unica / seleccion_multiple
  const isSingle = element.type === "seleccion_unica";
  const singleValue = answers[element.id] as string | undefined;
  const multiValue = (answers[element.id] as string[] | undefined) ?? [];
  const isSelected = (optId: string): boolean => (isSingle ? singleValue === optId : multiValue.includes(optId));

  return (
    <fieldset className="field runtime-question">
      <legend>{label}</legend>
      {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}
      {element.references && (
        <PreviewOptionReferences
          refType={element.references.refType ?? "public"}
          maxUrls={element.references.maxUrls ?? 3}
          value={answers[`${element.id}::refs`]}
          onChange={(next) => onAnswerChange(`${element.id}::refs`, next)}
          className="runtime-url-list"
        />
      )}
      <div className="runtime-options">
        {element.options.map((opt) => (
          <div className="option-row-group" key={opt.id}>
            <label className="field field--checkbox">
              <input
                type={isSingle ? "radio" : "checkbox"}
                name={element.id}
                checked={isSelected(opt.id)}
                onChange={() =>
                  isSingle
                    ? onChange(opt.id)
                    : onChange(isSelected(opt.id) ? multiValue.filter((id) => id !== opt.id) : [...multiValue, opt.id])
                }
              />
              <RichLabel html={opt.label} />
            </label>
            {/* VS-060 (docs/engines/form.md "Tabla embebida directamente en
                una opción de nivel superior"): mismo PreviewTableView que
                tabla_datos/subOption.table. */}
            {isSelected(opt.id) && opt.table && (
              <PreviewTableView
                label={opt.label}
                unitKeyPrefix={`${element.id}::${opt.id}::table`}
                columns={opt.table.columns}
                rows={opt.table.rows}
                table={(answers[`${element.id}::${opt.id}::table`] as TableValue | undefined) ?? {}}
                answers={answers}
                onAnswerChange={onAnswerChange}
                onChange={(next) => onAnswerChange(`${element.id}::${opt.id}::table`, next)}
              />
            )}
            {isSelected(opt.id) && opt.references && opt.references.position !== "after_suboptions" && (
              <PreviewOptionReferences
                refType={opt.references.refType ?? "public"}
                maxUrls={opt.references.maxUrls ?? 3}
                value={answers[`${element.id}::${opt.id}::refs`]}
                onChange={(next) => onAnswerChange(`${element.id}::${opt.id}::refs`, next)}
                className="runtime-url-list sub-options"
              />
            )}
            {isSelected(opt.id) && (
              <PreviewSubOptions
                level={1}
                exclusive={opt.subOptionsExclusive ?? false}
                subKey={`${element.id}::${opt.id}`}
                subOptions={opt.subOptions}
                value={answers[`${element.id}::${opt.id}`]}
                onChange={(next) => onAnswerChange(`${element.id}::${opt.id}`, next)}
                answers={answers}
                onAnswerChange={onAnswerChange}
              />
            )}
            {isSelected(opt.id) && (
              <PreviewSubOptions
                level={1}
                heading={opt.secondaryOptionsHeading}
                exclusive={opt.secondaryOptionsExclusive ?? false}
                subKey={`${element.id}::${opt.id}::secondary`}
                subOptions={opt.secondaryOptions}
                value={answers[`${element.id}::${opt.id}::secondary`]}
                onChange={(next) => onAnswerChange(`${element.id}::${opt.id}::secondary`, next)}
                answers={answers}
                onAnswerChange={onAnswerChange}
              />
            )}
            {isSelected(opt.id) && opt.references && opt.references.position === "after_suboptions" && (
              <PreviewOptionReferences
                refType={opt.references.refType ?? "public"}
                maxUrls={opt.references.maxUrls ?? 3}
                value={answers[`${element.id}::${opt.id}::refs`]}
                onChange={(next) => onAnswerChange(`${element.id}::${opt.id}::refs`, next)}
                className="runtime-url-list sub-options"
              />
            )}
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function updateCell(
  rowId: string,
  columnId: string,
  cell: string | number,
  table: TableValue,
  onChange: (value: AnswerValue) => void,
) {
  onChange({ ...table, [rowId]: { ...(table[rowId] ?? {}), [columnId]: cell } });
}

// Tabla de datos (VS-024, docs/engines/form.md "Tabla de datos"): misma
// semántica que FormTableView del Runtime real — celdas en el mapa anidado
// rowId->columnId->valor, unidad por fila via clave sintética
// `${unitKeyPrefix}::${row.id}${UNIT_KEY}`. Reutilizada por la tabla embebida
// de una sub-opción (VS-042): el Elemento pasa unitKeyPrefix = element.id,
// la sub-opción `${subKey}::${sub.id}::table`.
// VS-047 (docs/engines/form.md "Editor de tabla_datos estilo grilla"):
// mismo patrón que TableCalculatedCell del Runtime (evaluations/[token]/page.tsx).
function PreviewTableCalculatedCell({
  rowId,
  columnId,
  expression,
  table,
  onChange,
}: {
  rowId: string;
  columnId: string;
  expression: string | undefined;
  table: TableValue;
  onChange: (rowId: string, columnId: string, value: number) => void;
}) {
  const valuesByRow: Record<string, Record<string, number | undefined>> = {};
  for (const [r, rowVals] of Object.entries(table)) {
    const numRow: Record<string, number | undefined> = {};
    for (const [c, v] of Object.entries(rowVals)) {
      if (typeof v === "number") numRow[c] = v;
    }
    valuesByRow[r] = numRow;
  }
  const computed = expression ? evaluateTableExpression(expression, columnId, valuesByRow) : undefined;

  useEffect(() => {
    if (computed !== undefined && table[rowId]?.[columnId] !== computed) {
      onChange(rowId, columnId, computed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computed]);

  const display = computed === undefined ? "" : String(Number(computed.toFixed(2)));
  return <input value={display} disabled readOnly placeholder="(sin calcular)" />;
}

function PreviewTableView({
  label,
  unitKeyPrefix,
  columns,
  rows,
  table,
  answers,
  onAnswerChange,
  onChange,
}: {
  label: string;
  unitKeyPrefix: string;
  columns: TablaDatosConfig["columns"];
  rows: TablaDatosConfig["rows"];
  table: TableValue;
  answers: ResponseAnswers;
  onAnswerChange: (key: string, value: AnswerValue) => void;
  onChange: (value: AnswerValue) => void;
}) {
  return (
    <table className="runtime-table">
      <caption className="sr-only">{stripCommentHtml(label)}</caption>
      <tbody>
        {rows.map((row) => {
          const rowValue = table[row.id] ?? {};
          return (
            <tr key={row.id}>
              {columns.map((col) => {
                // VS-048 (docs/engines/form.md "Grilla uniforme sin
                // encabezados especiales"): sin fallback a un "tipo de fila
                // legacy" — ver misma nota en Runtime (page.tsx).
                const cellCfg = row.cells.find((c) => c.columnId === col.id);
                if (!cellCfg) {
                  return <td key={col.id} className="runtime-table__blank" />;
                }
                const { cellType, editable, content, expression, maxLength: cellMaxLength, options: cellOptions, unit, availableUnits } = cellCfg;
                const cell = rowValue[col.id];
                // "calculado" siempre se evalúa dinámicamente sin importar
                // `editable` — ver misma nota en Runtime (page.tsx).
                if (cellType === "calculado") {
                  return (
                    <td key={col.id}>
                      <PreviewTableCalculatedCell
                        rowId={row.id}
                        columnId={col.id}
                        expression={expression}
                        table={table}
                        onChange={(r, c, v) => updateCell(r, c, v, table, onChange)}
                      />
                    </td>
                  );
                }
                if (editable === false) {
                  return (
                    <td key={col.id}>
                      <RichLabel html={content ?? ""} />
                    </td>
                  );
                }
                if (cellType === "seleccion_desplegable") {
                  return (
                    <td key={col.id}>
                      <select
                        value={(cell as string) ?? ""}
                        onChange={(e) => updateCell(row.id, col.id, e.target.value, table, onChange)}
                      >
                        <option value="">Seleccionar…</option>
                        {(cellOptions ?? []).map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {stripCommentHtml(opt.label)}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                }
                if (cellType === "numero") {
                  // VS-048: unidad por CELDA — ver misma nota en Runtime (page.tsx).
                  const cellUnitKey = `${unitKeyPrefix}::${row.id}::${col.id}${UNIT_KEY}`;
                  const cellUnit = availableUnits ? ((answers[cellUnitKey] as string | undefined) ?? availableUnits[0]) : undefined;
                  return (
                    <td key={col.id}>
                      <input
                        type="number"
                        value={(cell as string | number | undefined) ?? ""}
                        onChange={(e) => updateCell(row.id, col.id, e.target.value === "" ? "" : Number(e.target.value), table, onChange)}
                      />
                      {availableUnits && availableUnits.length > 0 && (
                        <select value={cellUnit} onChange={(e) => onAnswerChange(cellUnitKey, e.target.value)}>
                          {availableUnits.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      )}
                      {!availableUnits && unit && <span className="runtime-question__unit"> ({unit})</span>}
                    </td>
                  );
                }
                return (
                  <td key={col.id}>
                    <input
                      type="text"
                      value={(cell as string | number | undefined) ?? ""}
                      maxLength={cellMaxLength}
                      onChange={(e) => updateCell(row.id, col.id, e.target.value, table, onChange)}
                    />
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Campo embebido en una sub-opción (VS-040, docs/engines/form.md "Campos
// embebidos en sub-opciones"): mismo comportamiento interactivo que los
// tipos de Elemento equivalentes (texto_corto/numero/seleccion_desplegable)
// ya usan en este preview — a diferencia de url_publica, un solo valor
// simple no justifica simplificarlo a solo lectura.
type SubOptionFieldConfig = NonNullable<
  Extract<FormElement, { type: "seleccion_unica" }>["options"][number]["subOptions"]
>[number]["field"];

function PreviewSubOptionField({
  field,
  value,
  onChange,
}: {
  field: NonNullable<SubOptionFieldConfig>;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
}) {
  if (field.type === "seleccion_desplegable") {
    return (
      <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Seleccionar…</option>
        {field.options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {stripCommentHtml(opt.label)}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "texto_corto") {
    return <input value={(value as string) ?? ""} maxLength={field.maxLength} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <span className="runtime-question__number-with-unit">
      <input
        type="number"
        value={value === undefined ? "" : (value as number)}
        min={field.min}
        max={field.max}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
      {field.unit && <span className="runtime-question__unit">{field.unit}</span>}
    </span>
  );
}

// Lista de slots de URL con botón "Agregar URL" explícito (no crece
// automáticamente al escribir) — hasta maxUrls, arranca en 1. Mismo
// componente para url_publica (VS-017) y references de opción/sub-opción
// (VS-039/040), mismo comportamiento que su equivalente en el Runtime real
// (`UrlSlotsView` en evaluations/[token]/page.tsx) — ajuste pedido por el
// usuario 2026-08-14 tras revisar en producción.
function PreviewUrlList({
  maxUrls,
  value,
  onChange,
  className,
}: {
  maxUrls: number;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  className: string;
}) {
  const urls = Array.isArray(value) && (value.length === 0 || typeof value[0] === "string") ? (value as string[]) : [];
  const [visibleCount, setVisibleCount] = useState(() => Math.max(urls.length, 1));
  const count = Math.min(visibleCount, maxUrls);
  const slots = Array.from({ length: count }, (_, i) => urls[i] ?? "");

  function commit(nextSlots: string[]) {
    onChange(nextSlots.map((s) => s.trim()).filter(Boolean));
  }

  function updateSlot(index: number, next: string) {
    const nextSlots = [...slots];
    nextSlots[index] = next;
    commit(nextSlots);
  }

  function removeSlot(index: number) {
    commit(slots.filter((_, i) => i !== index));
    setVisibleCount((c) => Math.max(c - 1, 1));
  }

  function addSlot() {
    setVisibleCount((c) => Math.min(c + 1, maxUrls));
  }

  return (
    <div className={className}>
      {slots.map((url, index) => (
        <div className="option-row" key={index}>
          <input type="url" placeholder="https://..." value={url} aria-label={`URL ${index + 1}`} onChange={(e) => updateSlot(index, e.target.value)} />
          {slots.length > 1 && (
            <button type="button" className="btn btn--danger btn--sm" onClick={() => removeSlot(index)}>
              Quitar
            </button>
          )}
        </div>
      ))}
      {slots.length < maxUrls && (
        <button type="button" className="btn btn--secondary btn--sm" onClick={addSlot}>
          Agregar URL
        </button>
      )}
    </div>
  );
}

// Referencias por opción/sub-opción con `refType` (VS-045): con "public"
// delega en PreviewUrlList (comportamiento VS-039/040). Con "flexible" cada
// slot elige tipo (URL pública / Documento interno) — en el preview el
// documento interno es solo de lectura: el editor no tiene R2 ni token
// (mismo criterio que el slot de evidencia), se sube en la evaluación real.
function PreviewOptionReferences({
  refType,
  maxUrls,
  value,
  onChange,
  className,
}: {
  refType: "public" | "flexible";
  maxUrls: number;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  className: string;
}) {
  if (refType !== "flexible") {
    return <PreviewUrlList maxUrls={maxUrls} value={value} onChange={onChange} className={className} />;
  }

  const slots = Array.isArray(value) ? value : [];
  const [visibleCount, setVisibleCount] = useState(() => Math.max(slots.length, 1));
  const [kinds, setKinds] = useState<("url" | "doc")[]>(() =>
    Array.from({ length: Math.min(Math.max(slots.length, 1), maxUrls) }, (_, i) =>
      typeof slots[i] === "string" ? "url" : "doc",
    ),
  );
  const count = Math.min(visibleCount, maxUrls);

  function updateSlot(index: number, next: string) {
    const nextSlots = slots.map((s) => (typeof s === "string" ? s : ""));
    nextSlots[index] = next;
    onChange(nextSlots.map((s) => s.trim()).filter(Boolean));
  }

  function removeSlot(index: number) {
    const nextSlots = slots.filter((_, i) => i !== index).map((s) => (typeof s === "string" ? s : ""));
    onChange(nextSlots.map((s) => s.trim()).filter(Boolean));
    setKinds((prev) => prev.filter((_, i) => i !== index));
    setVisibleCount((c) => Math.max(c - 1, 1));
  }

  return (
    <div className={className}>
      {Array.from({ length: count }, (_, index) => {
        const kind = kinds[index] ?? "url";
        const url = typeof slots[index] === "string" ? (slots[index] as string) : "";
        return (
          <div key={index} className="option-row">
            <select
              className="option-row__kind"
              value={kind}
              onChange={(e) => {
                const next = [...kinds];
                next[index] = e.target.value as "url" | "doc";
                setKinds(next);
              }}
            >
              <option value="url">URL pública</option>
              <option value="doc">Documento interno</option>
            </select>
            {kind === "doc" ? (
              <span className="runtime-evidence">Documento interno (se adjunta en la evaluación)</span>
            ) : (
              <input
                type="url"
                placeholder="https://..."
                value={url}
                aria-label={`URL ${index + 1}`}
                onChange={(e) => updateSlot(index, e.target.value)}
              />
            )}
            {count > 1 && (
              <button type="button" className="btn btn--danger btn--sm" onClick={() => removeSlot(index)}>
                Quitar
              </button>
            )}
          </div>
        );
      })}
      {count < maxUrls && (
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => setVisibleCount((c) => Math.min(c + 1, maxUrls))}>
          Agregar referencia
        </button>
      )}
    </div>
  );
}

function PreviewSubOptions({
  level,
  heading,
  exclusive = false,
  subKey,
  subOptions,
  value,
  onChange,
  answers,
  onAnswerChange,
}: {
  level: number;
  // VS-046: encabezado propio del bloque secundario (secondaryOptionsHeading)
  heading?: string | undefined;
  exclusive?: boolean;
  subKey: string;
  subOptions: Extract<FormElement, { type: "seleccion_unica" }>["options"][number]["subOptions"];
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  answers: ResponseAnswers;
  onAnswerChange: (key: string, value: AnswerValue) => void;
}) {
  if (!subOptions || subOptions.length === 0) return null;
  const isSelected = (subId: string): boolean =>
    exclusive ? value === subId : ((value as string[] | undefined)?.includes(subId) ?? false);
  return (
    <div className="sub-options" style={{ marginLeft: `var(--space-${2 + level})` }}>
      {heading && (
        <p className="sub-options__heading">
          <RichLabel html={heading} />
        </p>
      )}
      {subOptions.map((sub) => (
        <div className="option-row-group" key={sub.id}>
          <label className="field field--checkbox">
            <input
              type={exclusive ? "radio" : "checkbox"}
              name={subKey}
              checked={isSelected(sub.id)}
              onChange={() =>
                exclusive
                  ? onChange(sub.id)
                  : onChange(
                      (value as string[] | undefined)?.includes(sub.id)
                        ? (value as string[]).filter((id) => id !== sub.id)
                        : [...((value as string[] | undefined) ?? []), sub.id],
                    )
              }
            />
            <RichLabel html={sub.label} />
          </label>
          {isSelected(sub.id) && sub.field && (
            <PreviewSubOptionField
              field={sub.field}
              value={answers[`${subKey}::${sub.id}::field`]}
              onChange={(next) => onAnswerChange(`${subKey}::${sub.id}::field`, next)}
            />
          )}
          {/* VS-042: tabla embebida, misma PreviewTableView que tabla_datos
              con clave sintética `${subKey}::${sub.id}::table` */}
          {isSelected(sub.id) && sub.table && (
            <PreviewTableView
              label={sub.label}
              unitKeyPrefix={`${subKey}::${sub.id}::table`}
              columns={sub.table.columns}
              rows={sub.table.rows}
              table={(answers[`${subKey}::${sub.id}::table`] as TableValue | undefined) ?? {}}
              answers={answers}
              onAnswerChange={onAnswerChange}
              onChange={(next) => onAnswerChange(`${subKey}::${sub.id}::table`, next)}
            />
          )}
          {isSelected(sub.id) && sub.references && sub.references.position !== "after_suboptions" && (
            <PreviewOptionReferences
              refType={sub.references.refType ?? "public"}
              maxUrls={sub.references.maxUrls ?? 3}
              value={answers[`${subKey}::${sub.id}::refs`]}
              onChange={(next) => onAnswerChange(`${subKey}::${sub.id}::refs`, next)}
              className="runtime-url-list sub-options"
            />
          )}
          <PreviewSubOptions
            level={level + 1}
            subKey={`${subKey}::${sub.id}`}
            subOptions={sub.subOptions}
            value={answers[`${subKey}::${sub.id}`]}
            onChange={(next) => onAnswerChange(`${subKey}::${sub.id}`, next)}
            answers={answers}
            onAnswerChange={onAnswerChange}
          />
          {isSelected(sub.id) && sub.references && sub.references.position === "after_suboptions" && (
            <PreviewOptionReferences
              refType={sub.references.refType ?? "public"}
              maxUrls={sub.references.maxUrls ?? 3}
              value={answers[`${subKey}::${sub.id}::refs`]}
              onChange={(next) => onAnswerChange(`${subKey}::${sub.id}::refs`, next)}
              className="runtime-url-list sub-options"
            />
          )}
        </div>
      ))}
    </div>
  );
}

function PreviewBanner({ element }: { element: Extract<FormElement, { type: "banner" }> }) {
  const [expanded, setExpanded] = useState(!element.startCollapsed);
  return (
    <div className={`runtime-banner runtime-banner--${element.variant}`}>
      <button type="button" className="runtime-banner__toggle" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
        <span className="runtime-banner__caret">{expanded ? "▾" : "▸"}</span>
        <span>{element.label}</span>
      </button>
      {expanded && (
        <div className="runtime-banner__content" dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(element.content) }} />
      )}
    </div>
  );
}

function PreviewCalculado({
  element,
  number,
  answers,
}: {
  element: Extract<FormElement, { type: "calculado" }>;
  number: string | undefined;
  answers: ResponseAnswers;
}) {
  const numericValues: Record<string, number> = {};
  for (const [id, val] of Object.entries(answers)) {
    if (typeof val === "number") numericValues[id] = val;
  }
  const computed = evaluateExpression(element.expression, numericValues);
  const decimals = element.decimals ?? 2;
  const display = computed === undefined ? "" : String(Number(computed.toFixed(decimals)));

  return (
    <label className="field runtime-question">
      <span className="field__label">
        {number && `${number} `}
        <RichLabel html={element.label} fallback={<em>(sin texto)</em>} />
      </span>
      {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}
      <input value={display} disabled readOnly placeholder="(sin calcular)" />
    </label>
  );
}