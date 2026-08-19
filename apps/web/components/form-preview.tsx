"use client";

import {
  componentRegistry,
  evaluateExpression,
  evaluateTableExpression,
  isElementVisible,
  LEGACY_CONTROL_ID,
  legacyExtraIndex,
  normalizeCellComponents,
  questionNumber,
  sanitizeCommentHtml,
  stripCommentHtml,
  unitKey,
  type AnswerValue,
  type EvidenceRef,
  type FormElement,
  type FormTableCell,
  type ResponseAnswers,
  type TableCellComponent,
  type TableCellComponentValue,
  type TableCellValue,
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
            {isSelected(opt.id) && opt.references && opt.references.position !== "after_suboptions" && (
              <PreviewOptionReferences
                refType={opt.references.refType ?? "public"}
                maxUrls={opt.references.maxUrls ?? 3}
                value={answers[`${element.id}::${opt.id}::refs`]}
                onChange={(next) => onAnswerChange(`${element.id}::${opt.id}::refs`, next)}
                className="runtime-url-list sub-options"
              />
            )}
            {/* VS-062 (docs/engines/form.md "Campo embebido directo en una
                opción de nivel superior"): mismo PreviewSubOptionField que
                sub.field. Va antes de la tabla — mismo orden visual que el
                HTML real de S&P (COG_DisclosureMedian_Selection: "Moneda:"
                antes de la tabla). */}
            {isSelected(opt.id) && opt.field && (
              <PreviewSubOptionField
                field={opt.field}
                value={answers[`${element.id}::${opt.id}::field`]}
                onChange={(next) => onAnswerChange(`${element.id}::${opt.id}::field`, next)}
              />
            )}
            {/* VS-060 (docs/engines/form.md "Tabla embebida directamente en
                una opción de nivel superior"): mismo PreviewTableView que
                tabla_datos/subOption.table. Va después de las referencias
                "before_suboptions" (HTML real S&P: referencias antes de la
                tabla) — mismo criterio de posición que subOptions. */}
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
            {isSelected(opt.id) && (
              <PreviewSubOptions
                level={1}
                heading={opt.subOptionsHeading}
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


// Tabla de datos (VS-024, docs/engines/form.md "Tabla de datos"): misma
// semántica que FormTableView del Runtime real — celdas en el mapa anidado
// rowId->columnId->valor, unidad por fila via clave sintética
// `${unitKeyPrefix}::${row.id}${UNIT_KEY}`. Reutilizada por la tabla embebida
// de una sub-opción (VS-042): el Elemento pasa unitKeyPrefix = element.id,
// la sub-opción `${subKey}::${sub.id}::table`.
// VS-047 (docs/engines/form.md "Editor de tabla_datos estilo grilla"):
// mismo patrón que TableCalculatedCell del Runtime (evaluations/[token]/page.tsx).
// VS-077: `componentId` opcional — ver misma nota en Runtime.
function PreviewTableCalculatedCell({
  rowId,
  columnId,
  componentId,
  expression,
  table,
  onChange,
}: {
  rowId: string;
  columnId: string;
  componentId: string | undefined;
  expression: string | undefined;
  table: TableValue;
  onChange: (rowId: string, columnId: string, value: number) => void;
}) {
  const valuesByRow: Record<string, Record<string, number | Record<string, number> | undefined>> = {};
  for (const [r, rowVals] of Object.entries(table)) {
    const numRow: Record<string, number | Record<string, number> | undefined> = {};
    for (const [c, v] of Object.entries(rowVals)) {
      if (typeof v === "number") {
        numRow[c] = v;
      } else if (v && typeof v === "object") {
        const compNums: Record<string, number> = {};
        for (const [cid, cv] of Object.entries(v)) {
          if (typeof cv === "number") compNums[cid] = cv;
        }
        if (Object.keys(compNums).length > 0) numRow[c] = compNums;
      }
    }
    valuesByRow[r] = numRow;
  }
  const computed = expression ? evaluateTableExpression(expression, columnId, valuesByRow) : undefined;

  const cellValue = table[rowId]?.[columnId];
  const currentValue =
    componentId === undefined
      ? (cellValue as number | undefined)
      : (cellValue && typeof cellValue === "object" ? (cellValue as Record<string, number | undefined>)[componentId] : undefined);

  useEffect(() => {
    if (computed !== undefined && currentValue !== computed) {
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
          // VS-066 (docs/engines/form.md "Combinar columnas (colspan)"): ver
          // misma nota en Runtime (page.tsx).
          const coveredColumnIds = new Set<string>();
          row.cells.forEach((c) => {
            if (!c.colSpan || c.colSpan < 2) return;
            const anchorIdx = columns.findIndex((col) => col.id === c.columnId);
            if (anchorIdx === -1) return;
            for (let i = anchorIdx + 1; i < Math.min(anchorIdx + c.colSpan, columns.length); i++) {
              coveredColumnIds.add(columns[i]!.id);
            }
          });
          return (
            <tr key={row.id}>
              {columns.map((col) => {
                if (coveredColumnIds.has(col.id)) return null;
                // VS-048 (docs/engines/form.md "Grilla uniforme sin
                // encabezados especiales"): sin fallback a un "tipo de fila
                // legacy" — ver misma nota en Runtime (page.tsx).
                const cellCfg = row.cells.find((c) => c.columnId === col.id);
                if (!cellCfg) {
                  return <td key={col.id} className="runtime-table__blank" />;
                }
                // VS-077 (docs/engines/form.md "Runtime, Preview y
                // exportación"): reemplaza el switch por `cellType` — ver
                // misma nota en Runtime (page.tsx).
                return (
                  <td key={col.id} colSpan={cellCfg.colSpan}>
                    <PreviewTableCellComponentsView
                      row={row}
                      col={col}
                      cellCfg={cellCfg}
                      table={table}
                      answers={answers}
                      onChange={onChange}
                      onAnswerChange={onAnswerChange}
                      unitKeyPrefix={unitKeyPrefix}
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

// VS-077 (docs/engines/form.md "Runtime, Preview y exportación"): reemplaza
// el switch por `cellType` de PreviewTableView — mismo diseño que
// `TableCellComponentsView` del Runtime (evaluations/[token]/page.tsx), sin
// token/locked (el preview no sube adjuntos reales a R2) — mismo criterio ya
// usado por PreviewSubOptionField/PreviewExtraFields (ahora retirado).
function PreviewTableCellComponentsView({
  row,
  col,
  cellCfg,
  table,
  answers,
  onChange,
  onAnswerChange,
  unitKeyPrefix,
}: {
  row: TablaDatosConfig["rows"][number];
  col: TablaDatosConfig["columns"][number];
  cellCfg: FormTableCell;
  table: TableValue;
  answers: ResponseAnswers;
  onChange: (value: AnswerValue) => void;
  onAnswerChange: (key: string, value: AnswerValue) => void;
  unitKeyPrefix: string;
}) {
  const components = normalizeCellComponents(cellCfg);
  const isComponentModel = !!cellCfg.components?.length;
  const rawCell = table[row.id]?.[col.id];
  const componentMap: TableCellComponentValue = isComponentModel && rawCell && typeof rawCell === "object" ? (rawCell as TableCellComponentValue) : {};

  function updateScalar(value: string | number) {
    onChange({ ...table, [row.id]: { ...(table[row.id] ?? {}), [col.id]: value } });
  }
  function updateComponent(componentId: string, value: string | number) {
    onChange({ ...table, [row.id]: { ...(table[row.id] ?? {}), [col.id]: { ...componentMap, [componentId]: value } } });
  }

  return (
    <>
      {components.map((component) => {
        const gatedBy = components.find((c) => c.type === "casilla" && c.gates?.includes(component.id));
        if (gatedBy) {
          const gateValue = isComponentModel ? componentMap[gatedBy.id] : rawCell;
          if (gateValue !== "true") return null;
        }
        return (
          <PreviewTableCellComponentControl
            key={component.id}
            component={component}
            row={row}
            col={col}
            isComponentModel={isComponentModel}
            rawCell={rawCell}
            componentMap={componentMap}
            table={table}
            answers={answers}
            onAnswerChange={onAnswerChange}
            updateScalar={updateScalar}
            updateComponent={updateComponent}
            unitKeyPrefix={unitKeyPrefix}
          />
        );
      })}
    </>
  );
}

// Ver comentario de `TableCellComponentControl` en Runtime
// (evaluations/[token]/page.tsx) — misma resolución de clave de valor,
// idéntica lógica, sin token/locked.
function PreviewTableCellComponentControl({
  component,
  row,
  col,
  isComponentModel,
  rawCell,
  componentMap,
  table,
  answers,
  onAnswerChange,
  updateScalar,
  updateComponent,
  unitKeyPrefix,
}: {
  component: TableCellComponent;
  row: TablaDatosConfig["rows"][number];
  col: TablaDatosConfig["columns"][number];
  isComponentModel: boolean;
  rawCell: TableCellValue | TableCellComponentValue | undefined;
  componentMap: TableCellComponentValue;
  table: TableValue;
  answers: ResponseAnswers;
  onAnswerChange: (key: string, value: AnswerValue) => void;
  updateScalar: (value: string | number) => void;
  updateComponent: (componentId: string, value: string | number) => void;
  unitKeyPrefix: string;
}) {
  if (component.type === "texto_fijo") {
    return component.content ? <RichLabel html={component.content} /> : null;
  }

  if (component.type === "calculado") {
    return (
      <PreviewTableCalculatedCell
        rowId={row.id}
        columnId={col.id}
        componentId={isComponentModel ? component.id : undefined}
        expression={component.expression}
        table={table}
        onChange={(_r, _c, value) => (isComponentModel ? updateComponent(component.id, value) : updateScalar(value))}
      />
    );
  }

  if (component.type === "referencia") {
    const refsKey = isComponentModel
      ? `${unitKeyPrefix}::${row.id}::${col.id}::${component.id}::refs`
      : `${unitKeyPrefix}::${row.id}::${col.id}::refs`;
    const isPrimaryLegacyReference = !isComponentModel && component.id === LEGACY_CONTROL_ID;
    return (
      <PreviewOptionReferences
        refType={component.references?.refType ?? "public"}
        maxUrls={component.references?.maxUrls ?? 3}
        value={answers[refsKey]}
        onChange={(next) => {
          onAnswerChange(refsKey, next);
          const nextArr = Array.isArray(next) ? next : [];
          if (isPrimaryLegacyReference) updateScalar(nextArr.length > 0 ? "true" : "");
          else if (isComponentModel) updateComponent(component.id, nextArr.length > 0 ? "true" : "");
        }}
        className="runtime-url-list"
      />
    );
  }

  const legacyExtraIdx = !isComponentModel ? legacyExtraIndex(component.id) : undefined;
  const legacyExtraKey = legacyExtraIdx !== undefined ? `${unitKeyPrefix}::${row.id}::${col.id}::field::${legacyExtraIdx}` : undefined;

  let value: string | number | undefined;
  let setValue: (v: string | number) => void;
  if (isComponentModel) {
    value = componentMap[component.id];
    setValue = (v) => updateComponent(component.id, v);
  } else if (component.id === LEGACY_CONTROL_ID) {
    value = typeof rawCell === "object" ? undefined : (rawCell as string | number | undefined);
    setValue = updateScalar;
  } else if (legacyExtraKey !== undefined) {
    value = answers[legacyExtraKey] as string | number | undefined;
    setValue = (v) => onAnswerChange(legacyExtraKey, v);
  } else {
    value = undefined;
    setValue = () => {};
  }

  if (component.type === "texto_corto") {
    return (
      <>
        <input type="text" value={(value as string) ?? ""} maxLength={component.maxLength} onChange={(e) => setValue(e.target.value)} />
        {/* VS-070: hint de límite, réplica del HTML real de S&P. */}
        {component.maxLength && <span className="runtime-hint">máximo {component.maxLength} caracteres</span>}
      </>
    );
  }

  if (component.type === "numero") {
    const unitAnswerKey = isComponentModel
      ? unitKey(`${unitKeyPrefix}::${row.id}::${col.id}::${component.id}`)
      : unitKey(`${unitKeyPrefix}::${row.id}::${col.id}`);
    const currentUnit = component.availableUnits ? ((answers[unitAnswerKey] as string | undefined) ?? component.availableUnits[0]) : undefined;
    const parenthesizedUnit = isComponentModel || component.id === LEGACY_CONTROL_ID;
    return (
      <span className="runtime-question__number-with-unit">
        <input
          type="number"
          value={value === undefined ? "" : (value as number)}
          min={component.min}
          max={component.max}
          onChange={(e) => setValue(e.target.value === "" ? "" : Number(e.target.value))}
        />
        {component.availableUnits && component.availableUnits.length > 0 ? (
          <select value={currentUnit} onChange={(e) => onAnswerChange(unitAnswerKey, e.target.value)}>
            {component.availableUnits.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        ) : (
          component.unit && (
            <span className="runtime-question__unit">{parenthesizedUnit ? ` (${component.unit})` : component.unit}</span>
          )
        )}
      </span>
    );
  }

  if (component.type === "seleccion_desplegable") {
    return (
      <select value={(value as string) ?? ""} onChange={(e) => setValue(e.target.value)}>
        <option value="">Seleccionar…</option>
        {component.options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {stripCommentHtml(opt.label)}
          </option>
        ))}
      </select>
    );
  }

  // casilla
  const checked = value === "true";
  return (
    <label className="field field--checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => setValue(e.target.checked ? "true" : "")} />
      {component.checkboxLabel ? <RichLabel html={component.checkboxLabel} /> : <span className="sr-only">Marcar</span>}
    </label>
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
    return (
      <>
        <input value={(value as string) ?? ""} maxLength={field.maxLength} onChange={(e) => onChange(e.target.value)} />
        {/* VS-070: hint de límite, réplica del HTML real de S&P. */}
        {field.maxLength && <span className="runtime-hint">máximo {field.maxLength} caracteres</span>}
      </>
    );
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
    return (
      <>
        <PreviewUrlList maxUrls={maxUrls} value={value} onChange={onChange} className={className} />
        {/* VS-070: hint de límite, réplica del HTML real de S&P. */}
        <span className="runtime-hint">máximo {maxUrls} permitidos</span>
      </>
    );
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
      {/* VS-070: hint de límite, réplica del HTML real de S&P. */}
      <span className="runtime-hint">máximo {maxUrls} permitidos</span>
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
            exclusive={sub.subOptionsExclusive ?? false}
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