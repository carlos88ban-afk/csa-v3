"use client";

import {
  FormulaSyntaxError,
  componentRegistry,
  parseFormula,
  type Condition,
  type FormElement,
  type Subindicator,
} from "@plataforma-csa/sdk-core";
import { use, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { Breadcrumb, Button, Pill } from "@/components/ui";

interface Props {
  params: Promise<{
    frameworkId: string;
    dimensionId: string;
    subindicatorId: string;
  }>;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

// Metadata de tipo (etiqueta, si captura respuesta, versión) viene del
// registry de sdk-core — ver docs/engines/components.md. Esta página ya no
// mantiene su propia copia de esa información.
type QuestionComponentType = Extract<(typeof componentRegistry)[number], { isQuestion: true }>["type"];
const QUESTION_TYPES = new Set<QuestionComponentType>(
  componentRegistry.filter((c): c is Extract<(typeof componentRegistry)[number], { isQuestion: true }> => c.isQuestion).map((c) => c.type),
);

function isQuestion(el: FormElement): el is Extract<FormElement, { type: QuestionComponentType }> {
  return QUESTION_TYPES.has(el.type as QuestionComponentType);
}

function componentVersionOf(type: FormElement["type"]): number {
  return componentRegistry.find((c) => c.type === type)!.version;
}

function labelOf(type: FormElement["type"]): string {
  return componentRegistry.find((c) => c.type === type)!.label;
}

function newElement(type: FormElement["type"]): FormElement {
  const id = crypto.randomUUID();
  const componentVersion = componentVersionOf(type);
  switch (type) {
    case "texto_corto":
    case "texto_largo":
      return { id, type, label: "", componentVersion };
    case "numero":
      return { id, type, label: "", componentVersion };
    case "seleccion_unica":
    case "seleccion_multiple":
    case "seleccion_desplegable":
      return {
        id,
        type,
        label: "",
        options: [{ id: crypto.randomUUID(), label: "" }],
        componentVersion,
      };
    case "instruccion":
      return { id, type, label: "", componentVersion };
    case "banner":
      return { id, type, label: "", variant: "info", componentVersion };
    case "evidencia":
      return { id, type, label: "", componentVersion };
    case "url_publica":
      return { id, type, label: "", componentVersion };
    case "tabla_datos":
      return {
        id,
        type,
        label: "",
        columns: [{ id: crypto.randomUUID(), label: "" }],
        rows: [{ id: crypto.randomUUID(), label: "", cellType: "texto" }],
        componentVersion,
      };
    case "calculado":
      return { id, type, label: "", expression: "", componentVersion };
  }
}

// undefined si la fórmula es válida (o está vacía — a medio escribir, mismo
// criterio que un label vacío en form.md), el mensaje de error si no.
function formulaError(expression: string): string | undefined {
  if (expression.trim() === "") return undefined;
  try {
    parseFormula(expression);
    return undefined;
  } catch (err) {
    return err instanceof FormulaSyntaxError ? err.message : "Fórmula inválida";
  }
}

export default function DirectSubindicatorFormEditorPage({ params }: Props) {
  const { frameworkId, dimensionId, subindicatorId } = use(params);
  const [subindicator, setSubindicator] = useState<Subindicator | null>(null);
  const [elements, setElements] = useState<FormElement[]>([]);
  const [revisionNumber, setRevisionNumber] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addingType, setAddingType] = useState<FormElement["type"]>("texto_corto");

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.get<{ subindicator: Subindicator }>(`/api/subindicators/${subindicatorId}`).then((res) => {
      setSubindicator(res.subindicator);
      setElements(res.subindicator.formSchema?.elements ?? []);
      setRevisionNumber(res.subindicator.revisionNumber);
    });
  }, [subindicatorId]);

  // El autosave se dispara únicamente desde los manejadores de mutación de
  // abajo (acción explícita del usuario), nunca por un efecto reactivo sobre
  // `elements` — así los datos que llegan del servidor al cargar la página
  // nunca disparan un guardado ni bumpean revisionNumber por sí solos.
  function scheduleAutosave(next: FormElement[]) {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      setSaveStatus("saving");
      setSaveError(null);
      try {
        const res = await api.patch<{ subindicator: Subindicator }>(`/api/subindicators/${subindicatorId}`, {
          formSchema: { schemaVersion: 1, elements: next },
        });
        setRevisionNumber(res.subindicator.revisionNumber);
        setSaveStatus("saved");
      } catch (err) {
        setSaveStatus("error");
        setSaveError(err instanceof Error ? err.message : "No se pudo guardar");
      }
    }, 1500);
  }

  function commit(next: FormElement[]) {
    setElements(next);
    scheduleAutosave(next);
  }

  function updateElement(id: string, patch: Partial<FormElement>) {
    commit(elements.map((el) => (el.id === id ? ({ ...el, ...patch } as FormElement) : el)));
  }

  function moveElement(id: string, direction: -1 | 1) {
    const index = elements.findIndex((el) => el.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= elements.length) return;
    const next = [...elements];
    const moved = next[index]!;
    next.splice(index, 1);
    next.splice(target, 0, moved);
    commit(next);
  }

  function removeElement(id: string) {
    commit(elements.filter((el) => el.id !== id));
  }

  function addElement() {
    commit([...elements, newElement(addingType)]);
  }

  function addOption(elementId: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple" && el.type !== "seleccion_desplegable") return el;
        return { ...el, options: [...el.options, { id: crypto.randomUUID(), label: "" }] };
      }),
    );
  }

  function updateOption(elementId: string, optionId: string, label: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple" && el.type !== "seleccion_desplegable") return el;
        return {
          ...el,
          options: el.options.map((opt) => (opt.id === optionId ? { ...opt, label } : opt)),
        };
      }),
    );
  }

  function removeOption(elementId: string, optionId: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple" && el.type !== "seleccion_desplegable") return el;
        if (el.options.length <= 1) return el;
        return { ...el, options: el.options.filter((opt) => opt.id !== optionId) };
      }),
    );
  }

  // Sub-opciones anidadas (docs/engines/form.md, "Opciones anidadas VS-016"):
  // un solo nivel, mismo patrón CRUD que las opciones de primer nivel.
  function addSubOption(elementId: string, optionId: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return {
          ...el,
          options: el.options.map((opt) =>
            opt.id === optionId
              ? { ...opt, subOptions: [...(opt.subOptions ?? []), { id: crypto.randomUUID(), label: "" }] }
              : opt,
          ),
        };
      }),
    );
  }

  function updateSubOption(elementId: string, optionId: string, subOptionId: string, label: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return {
          ...el,
          options: el.options.map((opt) =>
            opt.id === optionId
              ? { ...opt, subOptions: (opt.subOptions ?? []).map((sub) => (sub.id === subOptionId ? { ...sub, label } : sub)) }
              : opt,
          ),
        };
      }),
    );
  }

  function removeSubOption(elementId: string, optionId: string, subOptionId: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return {
          ...el,
          options: el.options.map((opt) =>
            opt.id === optionId ? { ...opt, subOptions: (opt.subOptions ?? []).filter((sub) => sub.id !== subOptionId) } : opt,
          ),
        };
      }),
    );
  }

  function addSubSubOption(elementId: string, optionId: string, subOptionId: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return {
          ...el,
          options: el.options.map((opt) =>
            opt.id === optionId
              ? {
                  ...opt,
                  subOptions: (opt.subOptions ?? []).map((sub) =>
                    sub.id === subOptionId
                      ? { ...sub, subOptions: [...(sub.subOptions ?? []), { id: crypto.randomUUID(), label: "" }] }
                      : sub,
                  ),
                }
              : opt,
          ),
        };
      }),
    );
  }

  function updateSubSubOption(elementId: string, optionId: string, subOptionId: string, subSubOptionId: string, label: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return {
          ...el,
          options: el.options.map((opt) =>
            opt.id === optionId
              ? {
                  ...opt,
                  subOptions: (opt.subOptions ?? []).map((sub) =>
                    sub.id === subOptionId
                      ? { ...sub, subOptions: (sub.subOptions ?? []).map((subsub) => (subsub.id === subSubOptionId ? { ...subsub, label } : subsub)) }
                      : sub,
                  ),
                }
              : opt,
          ),
        };
      }),
    );
  }

  function removeSubSubOption(elementId: string, optionId: string, subOptionId: string, subSubOptionId: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return {
          ...el,
          options: el.options.map((opt) =>
            opt.id === optionId
              ? {
                  ...opt,
                  subOptions: (opt.subOptions ?? []).map((sub) =>
                    sub.id === subOptionId ? { ...sub, subOptions: (sub.subOptions ?? []).filter((subsub) => subsub.id !== subSubOptionId) } : sub,
                  ),
                }
              : opt,
          ),
        };
      }),
    );
  }

  // Tabla de datos (VS-024, docs/engines/form.md "Tabla de datos"): columnas
  // son solo encabezados, filas cargan tipo/unidad de toda la fila.
  type TableRow = Extract<FormElement, { type: "tabla_datos" }>["rows"][number];

  function addColumn(elementId: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId || el.type !== "tabla_datos") return el;
        return { ...el, columns: [...el.columns, { id: crypto.randomUUID(), label: "" }] };
      }),
    );
  }

  function updateColumn(elementId: string, columnId: string, label: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId || el.type !== "tabla_datos") return el;
        return { ...el, columns: el.columns.map((c) => (c.id === columnId ? { ...c, label } : c)) };
      }),
    );
  }

  function removeColumn(elementId: string, columnId: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId || el.type !== "tabla_datos") return el;
        if (el.columns.length <= 1) return el;
        return { ...el, columns: el.columns.filter((c) => c.id !== columnId) };
      }),
    );
  }

  function addRow(elementId: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId || el.type !== "tabla_datos") return el;
        return { ...el, rows: [...el.rows, { id: crypto.randomUUID(), label: "", cellType: "texto" as const }] };
      }),
    );
  }

  function updateRow(elementId: string, rowId: string, patch: Partial<TableRow>) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId || el.type !== "tabla_datos") return el;
        return { ...el, rows: el.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)) };
      }),
    );
  }

  function removeRow(elementId: string, rowId: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId || el.type !== "tabla_datos") return el;
        if (el.rows.length <= 1) return el;
        return { ...el, rows: el.rows.filter((r) => r.id !== rowId) };
      }),
    );
  }

  function addRowOption(elementId: string, rowId: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId || el.type !== "tabla_datos") return el;
        return {
          ...el,
          rows: el.rows.map((r) =>
            r.id === rowId ? { ...r, options: [...(r.options ?? []), { id: crypto.randomUUID(), label: "" }] } : r,
          ),
        };
      }),
    );
  }

  function updateRowOption(elementId: string, rowId: string, optionId: string, label: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId || el.type !== "tabla_datos") return el;
        return {
          ...el,
          rows: el.rows.map((r) =>
            r.id === rowId ? { ...r, options: (r.options ?? []).map((o) => (o.id === optionId ? { ...o, label } : o)) } : r,
          ),
        };
      }),
    );
  }

  function removeRowOption(elementId: string, rowId: string, optionId: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId || el.type !== "tabla_datos") return el;
        return {
          ...el,
          rows: el.rows.map((r) =>
            r.id === rowId && (r.options?.length ?? 0) > 1
              ? { ...r, options: (r.options ?? []).filter((o) => o.id !== optionId) }
              : r,
          ),
        };
      }),
    );
  }

  if (!subindicator) return <main className="loading">Cargando...</main>;

  return (
    <main className="page">
      <Breadcrumb
        items={[
          { label: "Frameworks", href: "/frameworks" },
          { label: "Framework", href: `/frameworks/${frameworkId}` },
          { label: "Dimensión", href: `/frameworks/${frameworkId}/dimensions/${dimensionId}` },
          { label: subindicator.title },
        ]}
      />
      <div className="entry-list__main">
        <h1>{subindicator.title}</h1>
        {/* 4.1.3 Status Messages — ver docs/architecture/accessibility.md */}
        <span aria-live="polite">
          {saveStatus === "saving" && <Pill variant="accent">Guardando…</Pill>}
          {saveStatus === "saved" && <Pill variant="good">Guardado — rev. {revisionNumber}</Pill>}
          {saveStatus === "idle" && revisionNumber !== null && <Pill>Rev. {revisionNumber}</Pill>}
        </span>
      </div>
      {saveStatus === "error" && <p className="alert" role="alert">Error al guardar: {saveError}</p>}

      <h2>Elementos</h2>
      {elements.length === 0 ? (
        <p className="empty">Todavía no hay elementos en este formulario.</p>
      ) : (
        <ol className="element-list">
          {elements.map((el, index) => (
            <li key={el.id} className="element-card">
              <div className="element-card__head">
                <span className="element-card__type">
                  {labelOf(el.type)} <Pill>{el.id}</Pill>
                </span>
                <span className="element-card__controls">
                  <Button type="button" size="sm" onClick={() => moveElement(el.id, -1)} disabled={index === 0} aria-label="Subir">
                    ▲
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => moveElement(el.id, 1)}
                    disabled={index === elements.length - 1}
                    aria-label="Bajar"
                  >
                    ▼
                  </Button>
                  <Button type="button" variant="danger" size="sm" onClick={() => removeElement(el.id)}>
                    Borrar
                  </Button>
                </span>
              </div>

              <label className="field">
                <span className="field__label">Texto</span>
                <input value={el.label} onChange={(e) => updateElement(el.id, { label: e.target.value })} />
              </label>

              <div className="field-grid">
                <label className="field">
                  <span className="field__label">Mostrar solo si (ver docs/engines/rule.md)</span>
                  <select
                    value={el.visibleIf?.elementId ?? ""}
                    onChange={(e) => {
                      const elementId = e.target.value;
                      updateElement(el.id, {
                        visibleIf:
                          elementId === ""
                            ? undefined
                            : { elementId, operator: el.visibleIf?.operator ?? "isAnswered", value: el.visibleIf?.value },
                      });
                    }}
                  >
                    <option value="">Siempre visible</option>
                    {elements
                      .filter((other) => other.id !== el.id)
                      .map((other) => (
                        <option key={other.id} value={other.id}>
                          {other.label || "(sin texto)"} — {other.id}
                        </option>
                      ))}
                  </select>
                </label>
                {el.visibleIf && (
                  <>
                    <label className="field">
                      <span className="field__label">Condición</span>
                      <select
                        value={el.visibleIf.operator}
                        onChange={(e) =>
                          updateElement(el.id, {
                            visibleIf: { ...(el.visibleIf as Condition), operator: e.target.value as Condition["operator"] },
                          })
                        }
                      >
                        <option value="isAnswered">Tiene respuesta</option>
                        <option value="isEmpty">No tiene respuesta</option>
                        <option value="equals">Es igual a</option>
                        <option value="notEquals">Es distinto de</option>
                        <option value="contains">Incluye (selección múltiple)</option>
                      </select>
                    </label>
                    {(el.visibleIf.operator === "equals" ||
                      el.visibleIf.operator === "notEquals" ||
                      el.visibleIf.operator === "contains") && (
                      <label className="field">
                        <span className="field__label">Valor</span>
                        <input
                          value={el.visibleIf.value ?? ""}
                          onChange={(e) =>
                            updateElement(el.id, { visibleIf: { ...(el.visibleIf as Condition), value: e.target.value } })
                          }
                        />
                      </label>
                    )}
                  </>
                )}
              </div>

              {isQuestion(el) && (
                <div className="field-grid">
                  <label className="field">
                    <span className="field__label">Ayuda</span>
                    <input
                      value={el.helpText ?? ""}
                      onChange={(e) => updateElement(el.id, { helpText: e.target.value })}
                    />
                  </label>
                  {el.type !== "calculado" && (
                    <label className="field field--checkbox">
                      <input
                        type="checkbox"
                        checked={el.required ?? false}
                        onChange={(e) => updateElement(el.id, { required: e.target.checked })}
                      />
                      <span className="field__label">Obligatorio</span>
                    </label>
                  )}
                </div>
              )}

              {(el.type === "texto_corto" || el.type === "texto_largo") && (
                <div className="field-grid">
                  <label className="field">
                    <span className="field__label">Longitud máxima</span>
                    <input
                      type="number"
                      value={el.maxLength ?? ""}
                      onChange={(e) =>
                        updateElement(el.id, {
                          maxLength: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
              )}

              {el.type === "numero" && (
                <div className="field-grid">
                  <label className="field">
                    <span className="field__label">Mínimo</span>
                    <input
                      type="number"
                      value={el.min ?? ""}
                      onChange={(e) =>
                        updateElement(el.id, { min: e.target.value === "" ? undefined : Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Máximo</span>
                    <input
                      type="number"
                      value={el.max ?? ""}
                      onChange={(e) =>
                        updateElement(el.id, { max: e.target.value === "" ? undefined : Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Unidad</span>
                    <input
                      value={el.unit ?? ""}
                      placeholder="ej. met. ton. CO2e, %, S/"
                      onChange={(e) => updateElement(el.id, { unit: e.target.value === "" ? undefined : e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Unidades disponibles (separadas por coma)</span>
                    <input
                      key={el.id}
                      defaultValue={el.availableUnits?.join(", ") ?? ""}
                      placeholder="ej. MWh, GJ, kWh"
                      // onBlur, no onChange: si se parsea/recorta en cada
                      // tecla, el re-render controlado borra la coma o el
                      // espacio que el usuario acaba de escribir (split(",")
                      // sobre un valor sin coma todavía da un solo token, y
                      // el trim le come el separador antes de que pueda
                      // completar el siguiente). Confirmado escribiendo a
                      // mano en producción durante la verificación de VS-023.
                      onBlur={(e) =>
                        updateElement(el.id, {
                          availableUnits:
                            e.target.value.trim() === ""
                              ? undefined
                              : e.target.value.split(",").map((s) => s.trim()).filter((s) => s.length > 0),
                        })
                      }
                    />
                  </label>
                </div>
              )}

              {el.type === "seleccion_desplegable" && (
                <div className="options">
                  <span className="options__label">Opciones</span>
                  {el.options.map((opt) => (
                    <div className="option-row" key={opt.id}>
                      <input value={opt.label} onChange={(e) => updateOption(el.id, opt.id, e.target.value)} />
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => removeOption(el.id, opt.id)}
                        disabled={el.options.length <= 1}
                      >
                        Quitar
                      </Button>
                    </div>
                  ))}
                  <Button type="button" size="sm" onClick={() => addOption(el.id)}>
                    Agregar opción
                  </Button>
                </div>
              )}

              {(el.type === "seleccion_unica" || el.type === "seleccion_multiple") && (
                <div className="options">
                  <span className="options__label">Opciones</span>
                  {el.options.map((opt) => (
                    <div className="option-row-group" key={opt.id}>
                      <div className="option-row">
                        <input value={opt.label} onChange={(e) => updateOption(el.id, opt.id, e.target.value)} />
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => removeOption(el.id, opt.id)}
                          disabled={el.options.length <= 1}
                        >
                          Quitar
                        </Button>
                      </div>
                      <div className="sub-options">
                        {(opt.subOptions ?? []).map((sub) => (
                          <div key={sub.id}>
                            <div className="option-row option-row--sub">
                              <input
                                value={sub.label}
                                placeholder="Sub-opción"
                                onChange={(e) => updateSubOption(el.id, opt.id, sub.id, e.target.value)}
                              />
                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                onClick={() => removeSubOption(el.id, opt.id, sub.id)}
                              >
                                Quitar
                              </Button>
                            </div>
                            <div className="sub-options" style={{ marginLeft: "var(--space-4)" }}>
                              {(sub.subOptions ?? []).map((subsub) => (
                                <div className="option-row option-row--subsub" key={subsub.id}>
                                  <input
                                    value={subsub.label}
                                    placeholder="Sub-sub-opción"
                                    onChange={(e) => updateSubSubOption(el.id, opt.id, sub.id, subsub.id, e.target.value)}
                                  />
                                  <Button
                                    type="button"
                                    variant="danger"
                                    size="sm"
                                    onClick={() => removeSubSubOption(el.id, opt.id, sub.id, subsub.id)}
                                  >
                                    Quitar
                                  </Button>
                                </div>
                              ))}
                              <Button type="button" size="sm" onClick={() => addSubSubOption(el.id, opt.id, sub.id)}>
                                Agregar sub-sub-opción
                              </Button>
                            </div>
                          </div>
                        ))}
                        <Button type="button" size="sm" onClick={() => addSubOption(el.id, opt.id)}>
                          Agregar sub-opción
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button type="button" size="sm" onClick={() => addOption(el.id)}>
                    Agregar opción
                  </Button>
                </div>
              )}

              {el.type === "seleccion_multiple" && (
                <div className="field-grid">
                  <label className="field">
                    <span className="field__label">Mínimo seleccionadas</span>
                    <input
                      type="number"
                      value={el.minSelected ?? ""}
                      onChange={(e) =>
                        updateElement(el.id, {
                          minSelected: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Máximo seleccionadas</span>
                    <input
                      type="number"
                      value={el.maxSelected ?? ""}
                      onChange={(e) =>
                        updateElement(el.id, {
                          maxSelected: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
              )}

              {el.type === "banner" && (
                <div className="field-grid">
                  <label className="field">
                    <span className="field__label">Tipo de aviso</span>
                    <select
                      value={el.variant}
                      onChange={(e) => updateElement(el.id, { variant: e.target.value as "info" | "warning" })}
                    >
                      <option value="info">Info</option>
                      <option value="warning">Advertencia</option>
                    </select>
                  </label>
                  <label className="field--checkbox">
                    <input
                      type="checkbox"
                      checked={el.expandable ?? false}
                      onChange={(e) => updateElement(el.id, { expandable: e.target.checked || undefined })}
                    />
                    Expandible/colapsable
                  </label>
                </div>
              )}

              {el.type === "evidencia" && (
                <div className="field-grid">
                  <label className="field">
                    <span className="field__label">Máximo de archivos</span>
                    <input
                      type="number"
                      value={el.maxFiles ?? ""}
                      onChange={(e) =>
                        updateElement(el.id, {
                          maxFiles: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Tamaño máximo por archivo (MB)</span>
                    <input
                      type="number"
                      value={el.maxSizeMb ?? ""}
                      onChange={(e) =>
                        updateElement(el.id, {
                          maxSizeMb: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Tipos aceptados (separados por coma, ej. pdf, png)</span>
                    <input
                      value={el.acceptedTypes?.join(", ") ?? ""}
                      onChange={(e) =>
                        updateElement(el.id, {
                          acceptedTypes:
                            e.target.value.trim() === ""
                              ? undefined
                              : e.target.value.split(",").map((s) => s.trim()).filter((s) => s.length > 0),
                        })
                      }
                    />
                  </label>
                </div>
              )}
              {el.type === "url_publica" && (
                <div className="field-grid">
                  <label className="field">
                    <span className="field__label">Máximo de URLs</span>
                    <input
                      type="number"
                      min={1}
                      value={el.maxUrls ?? ""}
                      onChange={(e) =>
                        updateElement(el.id, {
                          maxUrls: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
              )}
              {el.type === "tabla_datos" && (
                <>
                  <div className="options">
                    <span className="options__label">Columnas</span>
                    {el.columns.map((col) => (
                      <div className="option-row" key={col.id}>
                        <input
                          value={col.label}
                          placeholder="Encabezado de columna, ej. FY 2024"
                          onChange={(e) => updateColumn(el.id, col.id, e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => removeColumn(el.id, col.id)}
                          disabled={el.columns.length <= 1}
                        >
                          Quitar
                        </Button>
                      </div>
                    ))}
                    <Button type="button" size="sm" onClick={() => addColumn(el.id)}>
                      Agregar columna
                    </Button>
                  </div>

                  <div className="options">
                    <span className="options__label">Filas</span>
                    {el.rows.map((row) => (
                      <div className="option-row-group" key={row.id}>
                        <div className="option-row">
                          <input
                            value={row.label}
                            placeholder="Encabezado de fila, ej. Total Scope 1"
                            onChange={(e) => updateRow(el.id, row.id, { label: e.target.value })}
                          />
                          <select
                            value={row.cellType}
                            onChange={(e) =>
                              updateRow(el.id, row.id, {
                                cellType: e.target.value as TableRow["cellType"],
                                unit: undefined,
                                availableUnits: undefined,
                                options: undefined,
                                maxLength: undefined,
                              })
                            }
                          >
                            <option value="texto">Texto</option>
                            <option value="numero">Número</option>
                            <option value="seleccion_desplegable">Selección desplegable</option>
                          </select>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => removeRow(el.id, row.id)}
                            disabled={el.rows.length <= 1}
                          >
                            Quitar
                          </Button>
                        </div>

                        {row.cellType === "texto" && (
                          <label className="field">
                            <span className="field__label">Longitud máxima</span>
                            <input
                              type="number"
                              value={row.maxLength ?? ""}
                              onChange={(e) =>
                                updateRow(el.id, row.id, {
                                  maxLength: e.target.value === "" ? undefined : Number(e.target.value),
                                })
                              }
                            />
                          </label>
                        )}

                        {row.cellType === "numero" && (
                          <div className="field-grid">
                            <label className="field">
                              <span className="field__label">Unidad</span>
                              <input
                                value={row.unit ?? ""}
                                placeholder="ej. met. ton. CO2e, %"
                                onChange={(e) =>
                                  updateRow(el.id, row.id, { unit: e.target.value === "" ? undefined : e.target.value })
                                }
                              />
                            </label>
                            <label className="field">
                              <span className="field__label">Unidades disponibles (separadas por coma)</span>
                              <input
                                key={row.id}
                                defaultValue={row.availableUnits?.join(", ") ?? ""}
                                placeholder="ej. MWh, GJ, kWh"
                                // onBlur, no onChange: mismo bug/fix que VS-023
                                // (docs/engines/form.md) — controlado + recorte
                                // en cada tecla se come el separador recién
                                // escrito.
                                onBlur={(e) =>
                                  updateRow(el.id, row.id, {
                                    availableUnits:
                                      e.target.value.trim() === ""
                                        ? undefined
                                        : e.target.value.split(",").map((s) => s.trim()).filter((s) => s.length > 0),
                                  })
                                }
                              />
                            </label>
                          </div>
                        )}

                        {row.cellType === "seleccion_desplegable" && (
                          <div className="sub-options">
                            {(row.options ?? []).map((opt) => (
                              <div className="option-row option-row--sub" key={opt.id}>
                                <input
                                  value={opt.label}
                                  placeholder="Opción"
                                  onChange={(e) => updateRowOption(el.id, row.id, opt.id, e.target.value)}
                                />
                                <Button
                                  type="button"
                                  variant="danger"
                                  size="sm"
                                  onClick={() => removeRowOption(el.id, row.id, opt.id)}
                                  disabled={(row.options?.length ?? 0) <= 1}
                                >
                                  Quitar
                                </Button>
                              </div>
                            ))}
                            <Button type="button" size="sm" onClick={() => addRowOption(el.id, row.id)}>
                              Agregar opción
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                    <Button type="button" size="sm" onClick={() => addRow(el.id)}>
                      Agregar fila
                    </Button>
                  </div>
                </>
              )}
              {el.type === "calculado" && (
                <div className="field-grid">
                  <label className="field">
                    <span className="field__label">{"Fórmula (referencia otros elementos como {id})"}</span>
                    <input
                      value={el.expression}
                      placeholder="{el-1} + {el-2} * 2"
                      onChange={(e) => updateElement(el.id, { expression: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Decimales</span>
                    <input
                      type="number"
                      min={0}
                      value={el.decimals ?? ""}
                      onChange={(e) =>
                        updateElement(el.id, {
                          decimals: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  {formulaError(el.expression) && (
                    <p className="alert" role="alert">
                      {formulaError(el.expression)}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <h3>Agregar elemento</h3>
      <div className="add-element-bar">
        <select value={addingType} onChange={(e) => setAddingType(e.target.value as FormElement["type"])}>
          {componentRegistry.map((c) => (
            <option key={c.type} value={c.type}>
              {c.label}
            </option>
          ))}
        </select>
        <Button type="button" variant="primary" onClick={addElement}>
          Agregar elemento
        </Button>
      </div>
    </main>
  );
}
