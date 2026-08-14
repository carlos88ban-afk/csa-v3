"use client";

import {
  FormulaSyntaxError,
  componentRegistry,
  parseFormula,
  questionNumber,
  type Condition,
  type FormElement,
  type Subindicator,
} from "@plataforma-csa/sdk-core";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { Button, Pill } from "@/components/ui";
import { FormPreview } from "@/components/form-preview";
import { RichTextEditor } from "@/components/rich-text-editor";

interface Props {
  subindicatorId: string;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

// Metadatos de presentación de la paleta (VS-032 contrato 1): glifo, descripción
// de uso y ejemplo. Los TIPOS y labels humanos vienen del registry de sdk-core
// (docs/engines/components.md) — la paleta es solo capa de presentación, no
// duplica tipos.
const TYPE_META: Record<FormElement["type"], { glyph: string; description: string; example: string }> = {
  texto_corto: { glyph: "Ａ", description: "Respuesta breve de una línea", example: 'ej. "Año fiscal 2024"' },
  texto_largo: { glyph: "¶", description: "Respuesta extensa en varias líneas", example: 'ej. "Describí la política implementada"' },
  numero: { glyph: "#", description: "Valor numérico con unidad opcional", example: 'ej. "42 met. ton. CO2e"' },
  seleccion_unica: { glyph: "◉", description: "Una opción entre varias (admite sub-opciones)", example: 'ej. "Sí / No / Parcialmente"' },
  seleccion_multiple: { glyph: "☑", description: "Varias opciones seleccionables a la vez", example: 'ej. "Alcances 1, 2 y 3"' },
  seleccion_desplegable: { glyph: "▾", description: "Lista desplegable de opciones", example: 'ej. "Régimen fiscal…"' },
  instruccion: { glyph: "ℹ", description: "Texto informativo sin respuesta", example: 'ej. "Los límites son los del informe…"' },
  banner: { glyph: "!", description: "Aviso destacado (info o advertencia)", example: 'ej. "Cambio de criterio este ciclo"' },
  evidencia: { glyph: "⬆", description: "Subida de archivos (PDF, imágenes…)", example: 'ej. "Adjuntar factura de energía"' },
  url_publica: { glyph: "🔗", description: "Enlaces públicos de referencia", example: 'ej. "https://reporte-sostenibilidad…"' },
  tabla_datos: { glyph: "▦", description: "Matriz de filas × columnas con datos", example: 'ej. "Emisiones por sede y año"' },
  calculado: { glyph: "Σ", description: "Resultado automático de una fórmula", example: 'ej. "= Pregunta 1 × 1000"' },
};

const ELEMENT_PALETTE: { category: string; items: FormElement["type"][] }[] = [
  { category: "Preguntas", items: ["texto_corto", "texto_largo", "numero", "seleccion_unica", "seleccion_multiple", "seleccion_desplegable"] },
  { category: "Contenido", items: ["instruccion", "banner"] },
  { category: "Datos adjuntos", items: ["evidencia", "url_publica"] },
  { category: "Estructurados", items: ["tabla_datos"] },
  { category: "Automáticos", items: ["calculado"] },
];

// Plantillas rápidas del header (contrato 2): insertan con defaults sensatos
// (mismo newElement) y enfocan el card recién creado.
const QUICK_ADD: { label: string; type: FormElement["type"] }[] = [
  { label: "Texto", type: "texto_corto" },
  { label: "Número", type: "numero" },
  { label: "Elección", type: "seleccion_unica" },
  { label: "Tabla", type: "tabla_datos" },
];

// Secciones colapsables de cada card (contrato 4).
type SectionId = "texts" | "options" | "visibleIf" | "formula" | "advanced";

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
    case "numero":
    case "instruccion":
    case "evidencia":
    case "url_publica":
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
    case "banner":
      return { id, type, label: "", content: "", variant: "info", componentVersion };
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

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

export function SubindicatorEditor({ subindicatorId }: Props) {
  const [subindicator, setSubindicator] = useState<Subindicator | null>(null);
  const [elements, setElements] = useState<FormElement[]>([]);
  const [revisionNumber, setRevisionNumber] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Estado de plegado por card (contrato 4): overrides del usuario sobre los
  // defaults por sección; vive solo en memoria, no en el schema.
  const [sectionOverrides, setSectionOverrides] = useState<Record<string, Partial<Record<SectionId, boolean>>>>({});

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elementRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const labelRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const formulaRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const paletteRef = useRef<HTMLDivElement | null>(null);
  const paletteCloseRef = useRef<HTMLButtonElement | null>(null);
  const previewCloseRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    api.get<{ subindicator: Subindicator }>(`/api/subindicators/${subindicatorId}`).then((res) => {
      setSubindicator(res.subindicator);
      setElements(res.subindicator.formSchema?.elements ?? []);
      setRevisionNumber(res.subindicator.revisionNumber);
    });
  }, [subindicatorId]);

  // ESC cierra paleta y preview (contrato 1 y 5); focus trap simple para
  // paleta: si el foco está fuera del dialog, Tab lo devuelve al botón cerrar.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" && e.key !== "Tab") return;
      if (e.key === "Escape") {
        setPaletteOpen(false);
        setPreviewOpen(false);
        return;
      }
      if (paletteOpen && paletteRef.current && !paletteRef.current.contains(document.activeElement)) {
        e.preventDefault();
        paletteCloseRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen]);

  useEffect(() => {
    if (paletteOpen) paletteCloseRef.current?.focus();
    if (previewOpen) previewCloseRef.current?.focus();
  }, [paletteOpen, previewOpen]);

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

  // Contrato 2: inserta con defaults sensatos, scroll al card y focus del
  // label. Un solo camino para plantillas rápidas y paleta.
  function insertElement(mode: "quick" | "palette", type: FormElement["type"]) {
    const el = newElement(type);
    commit([...elements, el]);
    if (mode === "palette") setPaletteOpen(false);
    requestAnimationFrame(() => {
      elementRefs.current[el.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
      labelRefs.current[el.id]?.focus();
    });
  }

  function toggleSection(id: string, section: SectionId, open: boolean) {
    setSectionOverrides((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [section]: open } }));
  }

  function isSectionOpen(id: string, section: SectionId, defaultOpen: boolean): boolean {
    return sectionOverrides[id]?.[section] ?? defaultOpen;
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

  // ---- Derivados de presentación (lenguaje natural, contrato 3) ---------
  // Numeración de preguntas "solo hasta ese punto": 0.1, 0.2, … contando solo
  // isQuestion sobre la lista completa en edición (mismo questionNumber de
  // sdk-core). Los no-preguntas se muestran como "Contenido".
  const questionLabels = new Map<string, string>();
  {
    let qi = 0;
    for (const el of elements) {
      if (isQuestion(el)) {
        questionLabels.set(el.id, questionNumber(qi));
        qi += 1;
      }
    }
  }

  const elementsById = new Map(elements.map((el) => [el.id, el]));

  function referLabel(id: string): string {
    const target = elementsById.get(id);
    if (!target) return "(elemento eliminado)";
    const number = questionLabels.get(id);
    return number ? `Pregunta ${number}` : labelOf(target.type);
  }

  function visibleIfSummary(el: FormElement): string {
    const cond = el.visibleIf;
    if (!cond) return "siempre visible";
    const target = referLabel(cond.elementId);
    switch (cond.operator) {
      case "isAnswered":
        return `solo si ${target} tiene respuesta`;
      case "isEmpty":
        return `solo si ${target} no tiene respuesta`;
      case "equals":
        return `solo si ${target} es igual a "${cond.value}"`;
      case "notEquals":
        return `solo si ${target} es distinto de "${cond.value}"`;
      case "contains":
        return `solo si ${target} incluye "${cond.value}"`;
    }
  }

  function insertFormulaRef(elementId: string, sourceId: string) {
    const target = elementsById.get(elementId);
    const source = elementsById.get(sourceId);
    if (!target || target.type !== "calculado" || !source) return;
    const input = formulaRefs.current[elementId];
    const start = input?.selectionStart ?? (target.expression ?? "").length;
    const end = input?.selectionEnd ?? start;
    const ref = `{${source.id}}`;
    const expression = `${(target.expression ?? "").slice(0, start)}${ref}${(target.expression ?? "").slice(end)}`;
    updateElement(elementId, { expression });
    requestAnimationFrame(() => {
      const pos = start + ref.length;
      input?.setSelectionRange(pos, pos);
      input?.focus();
    });
  }

  // Fuentes de fórmula del mismo subindicador: preguntas numéricas y
  // calculadas (docs/engines/formula.md) — label humaneado, nunca el id.
  const formulaSources = elements.filter((el) => el.type === "numero" || el.type === "calculado");

  if (!subindicator) return <div className="loading">Cargando...</div>;

  return (
    <>
      <div className="entry-list__main">
        <h1>{subindicator.title}</h1>
        {/* 4.1.3 Status Messages — ver docs/architecture/accessibility.md */}
        <span aria-live="polite">
          {saveStatus === "saving" && <Pill variant="accent">Guardando…</Pill>}
          {saveStatus === "saved" && <Pill variant="good">Guardado — rev. {revisionNumber}</Pill>}
          {saveStatus === "idle" && revisionNumber !== null && <Pill>Rev. {revisionNumber}</Pill>}
        </span>
        <span style={{ marginInlineStart: "auto" }}>
          <Button type="button" size="sm" variant="secondary" onClick={() => setPreviewOpen(true)}>
            Ver como evaluado
          </Button>
        </span>
      </div>
      {saveStatus === "error" && <p className="alert" role="alert">Error al guardar: {saveError}</p>}

      <div className="editor-toolbar">
        <span className="editor-toolbar__label">Agregar pregunta:</span>
        {QUICK_ADD.map((q) => (
          <Button key={q.type} type="button" size="sm" onClick={() => insertElement("quick", q.type)}>
            {q.label}
          </Button>
        ))}
        <Button type="button" size="sm" variant="secondary" onClick={() => setPaletteOpen(true)}>
          Agregar elemento completo…
        </Button>
      </div>

      <h2>Elementos</h2>
      {elements.length === 0 ? (
        <p className="empty">Todavía no hay elementos en este formulario. Usá las plantillas rápidas de arriba.</p>
      ) : (
        <ol className="element-list">
          {elements.map((el, index) => {
            const numberBadge = questionLabels.get(el.id) ?? "Contenido";
            const textsOpen = isSectionOpen(el.id, "texts", el.label.trim() === "");
            const optionsOpen = isSectionOpen(
              el.id,
              "options",
              el.type === "tabla_datos"
                ? el.columns.some((c) => c.label.trim() === "") || el.rows.some((r) => r.label.trim() === "")
                : "options" in el
                  ? el.options.some((o) => o.label.trim() === "")
                  : false,
            );
            const visibleIfOpen = isSectionOpen(el.id, "visibleIf", false);
            const formulaOpen = isSectionOpen(el.id, "formula", el.type === "calculado" && (el.expression ?? "").trim() === "");
            const advancedOpen = isSectionOpen(el.id, "advanced", false);

            return (
              <li
                key={el.id}
                className="element-card"
                ref={(node) => {
                  elementRefs.current[el.id] = node;
                }}
              >
                <div className="element-card__head">
                  <span className="element-card__type">
                    <span className="element-card__glyph" aria-hidden="true">
                      {TYPE_META[el.type].glyph}
                    </span>
                    {labelOf(el.type)} <Pill>{numberBadge}</Pill>
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

                <details
                  className="element-section"
                  open={textsOpen}
                  onToggle={(e) => toggleSection(el.id, "texts", e.currentTarget.open)}
                >
                  <summary>
                    <span className="element-section__caret" aria-hidden="true">
                      {textsOpen ? "▾" : "▸"}
                    </span>
                    Textos
                  </summary>
                  <div className="element-section__body">
                    <label className="field">
                      <span className="field__label">
                        {isQuestion(el) ? "Texto de la pregunta" : el.type === "banner" ? "Título" : "Texto"}
                      </span>
                      <input
                        id={`element-label-${el.id}`}
                        value={el.label}
                        onChange={(e) => updateElement(el.id, { label: e.target.value })}
                        ref={(node) => {
                          labelRefs.current[el.id] = node;
                        }}
                      />
                    </label>
                    {el.type === "banner" && (
                      <RichTextEditor
                        value={el.content}
                        onChange={(html) => updateElement(el.id, { content: html })}
                        label="Contenido"
                        ariaLabel="Contenido del banner"
                      />
                    )}
                    {isQuestion(el) && (
                      <div className="field-grid">
                        <label className="field">
                          <span className="field__label">Ayuda</span>
                          <input value={el.helpText ?? ""} onChange={(e) => updateElement(el.id, { helpText: e.target.value })} />
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
                  </div>
                </details>

                {(el.type === "seleccion_unica" ||
                  el.type === "seleccion_multiple" ||
                  el.type === "seleccion_desplegable" ||
                  el.type === "tabla_datos") && (
                  <details
                    className="element-section"
                    open={optionsOpen}
                    onToggle={(e) => toggleSection(el.id, "options", e.currentTarget.open)}
                  >
                    <summary>
                      <span className="element-section__caret" aria-hidden="true">
                        {optionsOpen ? "▾" : "▸"}
                      </span>
                      {el.type === "tabla_datos" ? "Columnas y filas" : "Opciones de respuesta"}
                    </summary>
                    <div className="element-section__body">
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

                                {/* onBlur, no onChange: mismo bug/fix que VS-023
                                    (docs/engines/form.md) — controlado + recorte en
                                    cada tecla se come el separador recién escrito. */}
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
                                      <span className="field__label">Unidades separadas por comas</span>
                                      <input
                                        key={row.id}
                                        defaultValue={row.availableUnits?.join(", ") ?? ""}
                                        placeholder="ej. MWh, GJ, kWh"
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
                    </div>
                  </details>
                )}

                <details
                  className="element-section"
                  open={visibleIfOpen}
                  onToggle={(e) => toggleSection(el.id, "visibleIf", e.currentTarget.open)}
                >
                  <summary>
                    <span className="element-section__caret" aria-hidden="true">
                      {visibleIfOpen ? "▾" : "▸"}
                    </span>
                    Condición de visibilidad: <em>{visibleIfSummary(el)}</em>
                  </summary>
                  <div className="element-section__body">
                    <div className="field-grid">
                      <label className="field">
                        <span className="field__label">Mostrar este elemento</span>
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
                                {referLabel(other.id)} — {truncate(other.label || "(sin texto)", 40)}
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
                              <option value="isAnswered">tiene respuesta</option>
                              <option value="isEmpty">no tiene respuesta</option>
                              <option value="equals">es igual a</option>
                              <option value="notEquals">es distinto de</option>
                              <option value="contains">incluye (selección múltiple)</option>
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
                  </div>
                </details>

                {el.type === "calculado" && (
                  <details
                    className="element-section"
                    open={formulaOpen}
                    onToggle={(e) => toggleSection(el.id, "formula", e.currentTarget.open)}
                  >
                    <summary>
                      <span className="element-section__caret" aria-hidden="true">
                        {formulaOpen ? "▾" : "▸"}
                      </span>
                      Fórmula
                    </summary>
                    <div className="element-section__body">
                      <label className="field">
                        <span className="field__label">
                          {"Fórmula (suma, resta, multiplicación, división — también se puede usar {1 + 1})"}
                        </span>
                        <input
                          ref={(node) => {
                            formulaRefs.current[el.id] = node;
                          }}
                          value={el.expression}
                          placeholder='ej. Pregunta 1 × 1000 — insertala con los botones de abajo'
                          onChange={(e) => updateElement(el.id, { expression: e.target.value })}
                        />
                      </label>
                      {formulaSources.length > 0 && (
                        <div className="formula-chips">
                          <span className="formula-chips__label">Insertar pregunta:</span>
                          {formulaSources
                            .filter((s) => s.id !== el.id)
                            .map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                className="formula-chip"
                                onClick={() => insertFormulaRef(el.id, s.id)}
                              >
                                {questionLabels.get(s.id) ?? "?"} · {truncate(s.label || "(sin texto)", 30)}
                              </button>
                            ))}
                        </div>
                      )}
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
                  </details>
                )}

                {(el.type === "texto_corto" ||
                  el.type === "texto_largo" ||
                  el.type === "numero" ||
                  el.type === "seleccion_multiple" ||
                  el.type === "banner" ||
                  el.type === "evidencia" ||
                  el.type === "url_publica") && (
                  <details
                    className="element-section"
                    open={advancedOpen}
                    onToggle={(e) => toggleSection(el.id, "advanced", e.currentTarget.open)}
                  >
                    <summary>
                      <span className="element-section__caret" aria-hidden="true">
                        {advancedOpen ? "▾" : "▸"}
                      </span>
                      Avanzado
                    </summary>
                    <div className="element-section__body">
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
                          {/* onBlur, no onChange: mismo bug/fix que VS-023
                              (docs/engines/form.md) — ver comentario replicado
                              en la tabla de datos abajo. */}
                          <label className="field">
                            <span className="field__label">Unidades separadas por comas</span>
                            <input
                              key={el.id}
                              defaultValue={el.availableUnits?.join(", ") ?? ""}
                              placeholder="ej. MWh, GJ, kWh"
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
                          <label className="field">
                            <span className="field__label">Estado inicial</span>
                            <select
                              value={el.startCollapsed ? "collapsed" : "expanded"}
                              onChange={(e) =>
                                updateElement(el.id, { startCollapsed: e.target.value === "collapsed" || undefined })
                              }
                            >
                              <option value="expanded">Expandido</option>
                              <option value="collapsed">Contraído</option>
                            </select>
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
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {paletteOpen && (
        <>
          <div className="builder-palette-backdrop" onClick={() => setPaletteOpen(false)} aria-hidden="true" />
          <div className="builder-palette" role="dialog" aria-modal="true" aria-label="Agregar elemento" ref={paletteRef}>
            <div className="builder-palette__head">
              <h3>Agregar elemento</h3>
              <button
                type="button"
                className="builder-palette__close"
                aria-label="Cerrar paleta"
                onClick={() => setPaletteOpen(false)}
                ref={paletteCloseRef}
              >
                ✕
              </button>
            </div>
            <div className="builder-palette__body">
              {ELEMENT_PALETTE.map((cat) => (
                <section key={cat.category} className="builder-palette__category">
                  <h4>{cat.category}</h4>
                  <div className="builder-palette__grid">
                    {cat.items.map((type) => (
                      <button
                        key={type}
                        type="button"
                        className="builder-palette__card"
                        onClick={() => insertElement("palette", type)}
                      >
                        <span className="builder-palette__glyph" aria-hidden="true">
                          {TYPE_META[type].glyph}
                        </span>
                        <strong>{labelOf(type)}</strong>
                        <span className="builder-palette__desc">{TYPE_META[type].description}</span>
                        <span className="builder-palette__example">{TYPE_META[type].example}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </>
      )}

      {previewOpen && (
        <>
          <div className="form-preview-backdrop" onClick={() => setPreviewOpen(false)} aria-hidden="true" />
          <div
            className="form-preview-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Vista previa del formulario"
          >
            <div className="form-preview-drawer__head">
              <h3>Vista previa — {subindicator.title}</h3>
              <button
                type="button"
                className="form-preview-drawer__close"
                aria-label="Cerrar vista previa"
                onClick={() => setPreviewOpen(false)}
                ref={previewCloseRef}
              >
                ✕
              </button>
            </div>
            <FormPreview elements={elements} />
          </div>
        </>
      )}
    </>
  );
}