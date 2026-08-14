"use client";

import {
  componentRegistry,
  evaluateExpression,
  isElementVisible,
  questionNumber,
  sanitizeCommentHtml,
  type AnswerValue,
  type EvidenceRef,
  type FormElement,
  type ResponseAnswers,
  type TableValue,
} from "@plataforma-csa/sdk-core";
import { useMemo, useState } from "react";
import { Pill } from "@/components/ui";

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
        <label className="field--checkbox">
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
    return <p className="runtime-instruction">{element.label}</p>;
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
      {element.label || <em>(sin texto)</em>} {element.required && <Pill variant="warn">obligatorio</Pill>}
    </span>
  );

  if (element.type === "url_publica") {
    return (
      <fieldset className="field runtime-question">
        <legend>{label}</legend>
        {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}
        <div className="runtime-url-list">
          {Array.from({ length: element.maxUrls ?? 3 }, (_, i) => (
            <div className="option-row" key={i}>
              <input type="url" placeholder="https://..." readOnly value="" aria-label={`URL ${i + 1}`} />
            </div>
          ))}
        </div>
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
        <table className="runtime-table">
          <caption className="sr-only">{element.label}</caption>
          <thead>
            <tr>
              <th scope="col" />
              {element.columns.map((col) => (
                <th key={col.id} scope="col">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {element.rows.map((row) => {
              const rowValue = table[row.id] ?? {};
              const rowUnit = row.availableUnits
                ? ((answers[`${element.id}::${row.id}${UNIT_KEY}`] as string | undefined) ?? row.availableUnits[0])
                : undefined;
              return (
                <tr key={row.id}>
                  <th scope="row">
                    {row.label}
                    {row.availableUnits && row.availableUnits.length > 0 && (
                      <select
                        value={rowUnit}
                        onChange={(e) => onAnswerChange(`${element.id}::${row.id}${UNIT_KEY}`, e.target.value)}
                      >
                        {row.availableUnits.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    )}
                  </th>
                  {element.columns.map((col) => {
                    const cell = rowValue[col.id];
                    if (row.cellType === "seleccion_desplegable") {
                      return (
                        <td key={col.id}>
                          <select
                            value={(cell as string) ?? ""}
                            onChange={(e) => updateCell(row.id, col.id, e.target.value, table, onChange)}
                          >
                            <option value="">Seleccionar…</option>
                            {(row.options ?? []).map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    }
                    return (
                      <td key={col.id}>
                        <input
                          type={row.cellType === "numero" ? "number" : "text"}
                          value={(cell as string | number | undefined) ?? ""}
                          maxLength={row.maxLength}
                          onChange={(e) =>
                            updateCell(row.id, col.id, row.cellType === "numero" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value, table, onChange)
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
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
                {opt.label}
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
      <div className="runtime-options">
        {element.options.map((opt) => (
          <div className="option-row-group" key={opt.id}>
            <label className="field--checkbox">
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
              {opt.label}
            </label>
            {isSelected(opt.id) && (
              <PreviewSubOptions
                level={1}
                subKey={`${element.id}::${opt.id}`}
                subOptions={opt.subOptions}
                value={answers[`${element.id}::${opt.id}`]}
                onChange={(next) => onAnswerChange(`${element.id}::${opt.id}`, next)}
                answers={answers}
                onAnswerChange={onAnswerChange}
              />
            )}
            {isSelected(opt.id) && opt.references && (
              <div className="runtime-url-list sub-options">
                {Array.from({ length: opt.references.maxUrls ?? 3 }, (_, i) => (
                  <div className="option-row" key={i}>
                    <input type="url" placeholder="https://..." readOnly value="" aria-label={`Referencia ${i + 1}`} />
                  </div>
                ))}
              </div>
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

function PreviewSubOptions({
  level,
  subKey,
  subOptions,
  value,
  onChange,
  answers,
  onAnswerChange,
}: {
  level: number;
  subKey: string;
  subOptions: Extract<FormElement, { type: "seleccion_unica" }>["options"][number]["subOptions"];
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  answers: ResponseAnswers;
  onAnswerChange: (key: string, value: AnswerValue) => void;
}) {
  if (!subOptions || subOptions.length === 0) return null;
  return (
    <div className="sub-options" style={{ marginLeft: `var(--space-${2 + level})` }}>
      {subOptions.map((sub) => (
        <div className="option-row-group" key={sub.id}>
          <label className="field--checkbox">
            <input
              type={level === 1 ? "radio" : "checkbox"}
              name={subKey}
              checked={level === 1 ? value === sub.id : (value as string[] | undefined)?.includes(sub.id) ?? false}
              onChange={() =>
                level === 1
                  ? onChange(sub.id)
                  : onChange((value as string[] | undefined)?.includes(sub.id) ? (value as string[]).filter((id) => id !== sub.id) : [...((value as string[] | undefined) ?? []), sub.id])
              }
            />
            {sub.label}
          </label>
          <PreviewSubOptions
            level={level + 1}
            subKey={`${subKey}::${sub.id}`}
            subOptions={sub.subOptions}
            value={answers[`${subKey}::${sub.id}`]}
            onChange={(next) => onAnswerChange(`${subKey}::${sub.id}`, next)}
            answers={answers}
            onAnswerChange={onAnswerChange}
          />
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
        {element.label || <em>(sin texto)</em>}
      </span>
      {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}
      <input value={display} disabled readOnly placeholder="(sin calcular)" />
    </label>
  );
}