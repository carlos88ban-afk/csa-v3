"use client";

import type { FormElement, Subindicator } from "@plataforma-csa/sdk-core";
import { use, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";

interface Props {
  params: Promise<{
    frameworkId: string;
    dimensionId: string;
    indicatorId: string;
    subindicatorId: string;
  }>;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const ELEMENT_TYPE_LABELS: Record<FormElement["type"], string> = {
  texto_corto: "Texto corto",
  texto_largo: "Texto largo",
  numero: "Número",
  seleccion_unica: "Selección única",
  seleccion_multiple: "Selección múltiple",
  instruccion: "Instrucción",
  banner: "Banner",
};

type QuestionType = "texto_corto" | "texto_largo" | "numero" | "seleccion_unica" | "seleccion_multiple";
const QUESTION_TYPES = new Set<QuestionType>([
  "texto_corto",
  "texto_largo",
  "numero",
  "seleccion_unica",
  "seleccion_multiple",
]);

function isQuestion(el: FormElement): el is Extract<FormElement, { type: QuestionType }> {
  return QUESTION_TYPES.has(el.type as QuestionType);
}

function newElement(type: FormElement["type"]): FormElement {
  const id = crypto.randomUUID();
  switch (type) {
    case "texto_corto":
    case "texto_largo":
      return { id, type, label: "" };
    case "numero":
      return { id, type, label: "" };
    case "seleccion_unica":
    case "seleccion_multiple":
      return { id, type, label: "", options: [{ id: crypto.randomUUID(), label: "" }] };
    case "instruccion":
      return { id, type, label: "" };
    case "banner":
      return { id, type, label: "", variant: "info" };
  }
}

export default function SubindicatorFormEditorPage({ params }: Props) {
  const { frameworkId, dimensionId, indicatorId, subindicatorId } = use(params);
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
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return { ...el, options: [...el.options, { id: crypto.randomUUID(), label: "" }] };
      }),
    );
  }

  function updateOption(elementId: string, optionId: string, label: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
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
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        if (el.options.length <= 1) return el;
        return { ...el, options: el.options.filter((opt) => opt.id !== optionId) };
      }),
    );
  }

  if (!subindicator) return <main>Cargando...</main>;

  return (
    <main>
      <p>
        <a href={`/frameworks/${frameworkId}/dimensions/${dimensionId}/indicators/${indicatorId}`}>
          ← Indicador
        </a>
      </p>
      <h1>{subindicator.title}</h1>
      <p>
        {saveStatus === "saving" && "Guardando..."}
        {saveStatus === "saved" && `Guardado — revisión ${revisionNumber}`}
        {saveStatus === "error" && `Error al guardar: ${saveError}`}
        {saveStatus === "idle" && revisionNumber !== null && `Revisión ${revisionNumber}`}
      </p>

      <h2>Elementos</h2>
      {elements.length === 0 ? (
        <p>Todavía no hay elementos en este formulario.</p>
      ) : (
        <ol>
          {elements.map((el, index) => (
            <li key={el.id}>
              <p>
                <strong>{ELEMENT_TYPE_LABELS[el.type]}</strong>{" "}
                <button type="button" onClick={() => moveElement(el.id, -1)} disabled={index === 0}>
                  ▲
                </button>{" "}
                <button
                  type="button"
                  onClick={() => moveElement(el.id, 1)}
                  disabled={index === elements.length - 1}
                >
                  ▼
                </button>{" "}
                <button type="button" onClick={() => removeElement(el.id)}>
                  Borrar
                </button>
              </p>

              <label>
                Texto
                <input
                  value={el.label}
                  onChange={(e) => updateElement(el.id, { label: e.target.value })}
                />
              </label>

              {isQuestion(el) && (
                <>
                  <label>
                    Ayuda
                    <input
                      value={el.helpText ?? ""}
                      onChange={(e) => updateElement(el.id, { helpText: e.target.value })}
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={el.required ?? false}
                      onChange={(e) => updateElement(el.id, { required: e.target.checked })}
                    />
                    Obligatorio
                  </label>
                </>
              )}

              {(el.type === "texto_corto" || el.type === "texto_largo") && (
                <label>
                  Longitud máxima
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
              )}

              {el.type === "numero" && (
                <>
                  <label>
                    Mínimo
                    <input
                      type="number"
                      value={el.min ?? ""}
                      onChange={(e) =>
                        updateElement(el.id, { min: e.target.value === "" ? undefined : Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Máximo
                    <input
                      type="number"
                      value={el.max ?? ""}
                      onChange={(e) =>
                        updateElement(el.id, { max: e.target.value === "" ? undefined : Number(e.target.value) })
                      }
                    />
                  </label>
                </>
              )}

              {(el.type === "seleccion_unica" || el.type === "seleccion_multiple") && (
                <div>
                  <p>Opciones</p>
                  <ul>
                    {el.options.map((opt) => (
                      <li key={opt.id}>
                        <input
                          value={opt.label}
                          onChange={(e) => updateOption(el.id, opt.id, e.target.value)}
                        />{" "}
                        <button
                          type="button"
                          onClick={() => removeOption(el.id, opt.id)}
                          disabled={el.options.length <= 1}
                        >
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => addOption(el.id)}>
                    Agregar opción
                  </button>
                </div>
              )}

              {el.type === "seleccion_multiple" && (
                <>
                  <label>
                    Mínimo seleccionadas
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
                  <label>
                    Máximo seleccionadas
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
                </>
              )}

              {el.type === "banner" && (
                <label>
                  Tipo de aviso
                  <select
                    value={el.variant}
                    onChange={(e) =>
                      updateElement(el.id, { variant: e.target.value as "info" | "warning" })
                    }
                  >
                    <option value="info">Info</option>
                    <option value="warning">Advertencia</option>
                  </select>
                </label>
              )}
            </li>
          ))}
        </ol>
      )}

      <h3>Agregar elemento</h3>
      <select value={addingType} onChange={(e) => setAddingType(e.target.value as FormElement["type"])}>
        {Object.entries(ELEMENT_TYPE_LABELS).map(([type, label]) => (
          <option key={type} value={type}>
            {label}
          </option>
        ))}
      </select>{" "}
      <button type="button" onClick={addElement}>
        Agregar elemento
      </button>
    </main>
  );
}
