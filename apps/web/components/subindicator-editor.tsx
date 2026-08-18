"use client";

import {
  FormulaSyntaxError,
  componentRegistry,
  parseFormula,
  questionNumber,
  stripCommentHtml,
  type Condition,
  type FormElement,
  type Subindicator,
  type TablaDatosConfig,
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
    case "tabla_datos": {
      // VS-048 (docs/engines/form.md "Grilla uniforme sin encabezados
      // especiales"): arranca con UNA celda real — sin encabezados
      // especiales, la posición (fila 0, columna 0) es una celda como
      // cualquier otra.
      const colId = crypto.randomUUID();
      return {
        id,
        type,
        label: "",
        columns: [{ id: colId }],
        rows: [{ id: crypto.randomUUID(), cells: [{ columnId: colId, cellType: "texto", editable: true }] }],
        componentVersion,
      };
    }
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

// Tabla de datos (VS-024 + VS-042 + VS-048, docs/engines/form.md "Tabla de
// datos", "Tabla dentro de una sub-opción" y "Grilla uniforme sin
// encabezados especiales"): mismo editor para el Elemento `tabla_datos` y
// para la tabla embebida de una sub-opción. Controlado: las mutaciones son
// internas, el padre recibe el estado completo (mismo patrón inmutable que
// el resto del Builder).
type TableConfigColumns = TablaDatosConfig["columns"];
type TableConfigRows = TablaDatosConfig["rows"];

// VS-048 (docs/engines/form.md "Grilla uniforme sin encabezados
// especiales"): sin distinción entre "encabezado" y "celda de dato" — la
// tabla es una grilla uniforme, arranca de UNA celda (la posición fila 0 /
// columna 0 es una celda real como cualquier otra, no un hueco
// estructural), "+" en los bordes para agregar columna a la derecha/fila
// abajo, "+"/"×" por celda para grillas irregulares, y por celda: tipo,
// editable/solo-lectura, contenido fijo o config según el tipo. Si el admin
// quiere que una celda actúe como encabezado, la marca "solo lectura" con
// el texto que corresponda — mismo mecanismo que cualquier otra celda fija.
type TableConfigCell = TableConfigRows[number]["cells"][number];

function TableConfigEditor({
  columns,
  rows,
  onChange,
}: {
  columns: TableConfigColumns;
  rows: TableConfigRows;
  onChange: (next: { columns: TableConfigColumns; rows: TableConfigRows }) => void;
}) {
  // Qué celda tiene su panel de configuración expandido — estado local, no
  // persistido (mismo criterio que sectionOverrides del resto del Builder).
  const [expandedCell, setExpandedCell] = useState<string | null>(null);

  function removeColumn(columnId: string) {
    if (columns.length <= 1) return;
    onChange({
      columns: columns.filter((c) => c.id !== columnId),
      rows: rows.map((r) => ({ ...r, cells: r.cells.filter((c) => c.columnId !== columnId) })),
    });
  }

  // Agregar columna a la derecha: extiende cada fila con una celda default
  // (texto, editable) — "Excel extiende la hoja"; el admin puede quitar
  // celdas puntuales después si esa columna necesita menos filas que las
  // demás.
  function addColumn() {
    const column = { id: crypto.randomUUID() };
    onChange({
      columns: [...columns, column],
      rows: rows.map((r) => ({ ...r, cells: [...r.cells, { columnId: column.id, cellType: "texto", editable: true }] })),
    });
  }

  function removeRow(rowId: string) {
    if (rows.length <= 1) return;
    onChange({ columns, rows: rows.filter((r) => r.id !== rowId) });
  }

  // Agregar fila abajo: una celda default por columna existente.
  function addRow() {
    onChange({
      columns,
      rows: [...rows, { id: crypto.randomUUID(), cells: columns.map((c) => ({ columnId: c.id, cellType: "texto", editable: true })) }],
    });
  }

  function addCell(rowId: string, columnId: string) {
    onChange({
      columns,
      rows: rows.map((r) => (r.id === rowId ? { ...r, cells: [...r.cells, { columnId, cellType: "texto", editable: true }] } : r)),
    });
    setExpandedCell(`${rowId}:${columnId}`);
  }

  function removeCell(rowId: string, columnId: string) {
    onChange({
      columns,
      rows: rows.map((r) => (r.id === rowId ? { ...r, cells: r.cells.filter((c) => c.columnId !== columnId) } : r)),
    });
  }

  function updateCell(rowId: string, columnId: string, patch: Partial<TableConfigCell>) {
    onChange({
      columns,
      rows: rows.map((r) => (r.id === rowId ? { ...r, cells: r.cells.map((c) => (c.columnId === columnId ? { ...c, ...patch } : c)) } : r)),
    });
  }

  function addCellOption(rowId: string, columnId: string, current: TableConfigCell | undefined) {
    updateCell(rowId, columnId, { options: [...(current?.options ?? []), { id: crypto.randomUUID(), label: "" }] });
  }

  function updateCellOption(rowId: string, columnId: string, optionId: string, label: string, current: TableConfigCell | undefined) {
    updateCell(rowId, columnId, { options: (current?.options ?? []).map((o) => (o.id === optionId ? { ...o, label } : o)) });
  }

  function removeCellOption(rowId: string, columnId: string, optionId: string, current: TableConfigCell | undefined) {
    if ((current?.options?.length ?? 0) <= 1) return;
    updateCell(rowId, columnId, { options: (current?.options ?? []).filter((o) => o.id !== optionId) });
  }

  const CELL_TYPE_LABEL: Record<TableConfigCell["cellType"], string> = {
    texto: "Texto",
    numero: "Número",
    seleccion_desplegable: "Selección",
    calculado: "Calculado",
    casilla: "Casilla de verificación",
  };

  return (
    <div className="table-config-grid-wrap">
      <table className="table-config-grid">
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={row.id}>
              {columns.map((col) => {
                const cell = row.cells.find((c) => c.columnId === col.id);
                const cellKey = `${row.id}:${col.id}`;
                if (!cell) {
                  return (
                    <td key={col.id} className="table-config-grid__blank">
                      <button type="button" className="table-config-grid__add-cell" onClick={() => addCell(row.id, col.id)} title="Agregar celda aquí">
                        +
                      </button>
                    </td>
                  );
                }
                const editable = cell.editable !== false;
                  // "calculado" es de solo lectura por naturaleza (lo llena
                  // la fórmula, no el evaluado ni el admin) — es un tercer
                  // modo de renderizado, no un caso de "editable"/"fijo".
                  // Antes vivía dentro de la rama `editable`, así que
                  // desmarcar "Editable" ocultaba la fórmula y la
                  // reemplazaba por un editor de contenido fijo vacío,
                  // perdiendo el acceso a la expresión sin borrar los datos
                  // (bug real, hallado 2026-08-15 reproduciendo un reporte
                  // de usuario: "no me permite construir tablas" con una
                  // fila calculada de solo lectura).
                  const isCalculado = cell.cellType === "calculado";
                  return (
                    <td key={col.id} className="table-config-grid__cell">
                      <button
                        type="button"
                        className="table-config-grid__chip"
                        onClick={() => setExpandedCell(expandedCell === cellKey ? null : cellKey)}
                      >
                        {isCalculado ? "Calculado" : editable ? CELL_TYPE_LABEL[cell.cellType] : "Fijo"}
                      </button>
                      <button
                        type="button"
                        className="table-config-grid__remove-cell"
                        onClick={() => removeCell(row.id, col.id)}
                        title="Quitar celda"
                        aria-label="Quitar celda"
                      >
                        ×
                      </button>
                      {expandedCell === cellKey && (
                        <div className="table-config-grid__cell-config">
                          <label className="field">
                            <span className="field__label">Tipo</span>
                            <select
                              value={cell.cellType}
                              onChange={(e) => {
                                const nextType = e.target.value as TableConfigCell["cellType"];
                                updateCell(row.id, col.id, {
                                  cellType: nextType,
                                  unit: undefined,
                                  availableUnits: undefined,
                                  options: undefined,
                                  maxLength: undefined,
                                  expression: undefined,
                                  revealText: undefined,
                                  editable: nextType === "calculado" ? true : cell.editable,
                                });
                              }}
                            >
                              <option value="texto">Texto</option>
                              <option value="numero">Número</option>
                              <option value="seleccion_desplegable">Selección desplegable</option>
                              <option value="calculado">Calculado</option>
                              <option value="casilla">Casilla de verificación</option>
                            </select>
                          </label>

                          {isCalculado ? (
                            <label className="field">
                              <span className="field__label">Fórmula (referencia otras filas de esta columna con {"{"}filaId{"}"})</span>
                              <input
                                value={cell.expression ?? ""}
                                placeholder="ej. {r1}+{r2}+{r3}"
                                onChange={(e) => updateCell(row.id, col.id, { expression: e.target.value })}
                              />
                              {formulaError(cell.expression ?? "") && (
                                <p className="alert" role="alert">
                                  {formulaError(cell.expression ?? "")}
                                </p>
                              )}
                              <div className="table-config-grid__formula-refs">
                                {rows
                                  .map((r, i) => ({ r, i }))
                                  .filter(({ r }) => r.id !== row.id)
                                  .map(({ r, i }) => (
                                    <button
                                      type="button"
                                      key={r.id}
                                      className="table-config-grid__formula-ref"
                                      onClick={() => updateCell(row.id, col.id, { expression: `${cell.expression ?? ""}{${r.id}}` })}
                                    >
                                      Fila {i + 1}
                                    </button>
                                  ))}
                              </div>
                            </label>
                          ) : (
                            <>
                              <label className="field field--checkbox">
                                <input
                                  type="checkbox"
                                  checked={editable}
                                  onChange={(e) => updateCell(row.id, col.id, { editable: e.target.checked })}
                                />
                                <span className="field__label">{editable ? "Editable (lo llena el evaluado)" : "Solo lectura (contenido fijo)"}</span>
                              </label>

                              {!editable ? (
                                <label className="field">
                                  <span className="field__label">Contenido fijo</span>
                                  <RichTextEditor
                                    value={cell.content ?? ""}
                                    onChange={(html) => updateCell(row.id, col.id, { content: html })}
                                    ariaLabel="Contenido fijo de la celda"
                                  />
                                </label>
                              ) : (
                                <>
                                  {cell.cellType === "texto" && (
                                    <label className="field">
                                      <span className="field__label">Longitud máxima</span>
                                      <input
                                        type="number"
                                        value={cell.maxLength ?? ""}
                                        onChange={(e) => updateCell(row.id, col.id, { maxLength: e.target.value === "" ? undefined : Number(e.target.value) })}
                                      />
                                    </label>
                                  )}

                                  {cell.cellType === "numero" && (
                                    <div className="field-grid">
                                      <label className="field">
                                        <span className="field__label">Unidad</span>
                                        <input
                                          value={cell.unit ?? ""}
                                          placeholder="ej. met. ton. CO2e, %"
                                          onChange={(e) => updateCell(row.id, col.id, { unit: e.target.value === "" ? undefined : e.target.value })}
                                        />
                                      </label>
                                      <label className="field">
                                        <span className="field__label">Unidades separadas por comas</span>
                                        <input
                                          key={cellKey}
                                          defaultValue={cell.availableUnits?.join(", ") ?? ""}
                                          placeholder="ej. MWh, GJ, kWh"
                                          onBlur={(e) =>
                                            updateCell(row.id, col.id, {
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

                                  {cell.cellType === "seleccion_desplegable" && (
                                    <div className="sub-options">
                                      {(cell.options ?? []).map((opt) => (
                                        <div className="option-row option-row--sub" key={opt.id}>
                                          <div className="option-row__editor">
                                            <RichTextEditor
                                              value={opt.label}
                                              onChange={(html) => updateCellOption(row.id, col.id, opt.id, html, cell)}
                                              ariaLabel="Opción de celda"
                                            />
                                          </div>
                                          <Button
                                            type="button"
                                            variant="danger"
                                            size="sm"
                                            onClick={() => removeCellOption(row.id, col.id, opt.id, cell)}
                                            disabled={(cell.options?.length ?? 0) <= 1}
                                          >
                                            Quitar
                                          </Button>
                                        </div>
                                      ))}
                                      <Button type="button" size="sm" onClick={() => addCellOption(row.id, col.id, cell)}>
                                        Agregar opción
                                      </Button>
                                    </div>
                                  )}

                                  {cell.cellType === "casilla" && (
                                    <label className="field field--checkbox">
                                      <input
                                        type="checkbox"
                                        checked={cell.revealText === true}
                                        onChange={(e) => updateCell(row.id, col.id, { revealText: e.target.checked })}
                                      />
                                      <span className="field__label">Permitir texto adicional al marcar</span>
                                    </label>
                                  )}
                                </>
                              )}
                            </>
                          )}
                          <div className="table-config-grid__cell-footer">
                            <Button type="button" variant="danger" size="sm" onClick={() => removeRow(row.id)} disabled={rows.length <= 1}>
                              Quitar fila
                            </Button>
                            <Button type="button" variant="danger" size="sm" onClick={() => removeColumn(col.id)} disabled={columns.length <= 1}>
                              Quitar columna
                            </Button>
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}
              {rowIdx === 0 && (
                <td className="table-config-grid__add-col" rowSpan={rows.length}>
                  <Button type="button" size="sm" onClick={addColumn} title="Agregar columna a la derecha">
                    + columna
                  </Button>
                </td>
              )}
            </tr>
          ))}
          <tr>
            <td colSpan={columns.length + 1} className="table-config-grid__add-row">
              <Button type="button" size="sm" onClick={addRow} title="Agregar fila abajo">
                + fila
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
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
  // VS-046 ("Bloque secundario de sub-opciones por opción"): mismo shape que
  // `subOptions`, ahora reusado también para `secondaryOptions` — todas las
  // funciones de este grupo ganan un parámetro `block` opcional (default
  // "subOptions", preserva el comportamiento de todo call-site existente)
  // en vez de duplicar cada función para el bloque secundario.
  type OptionSubBlock = "subOptions" | "secondaryOptions";

  function addSubOption(elementId: string, optionId: string, block: OptionSubBlock = "subOptions") {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return {
          ...el,
          options: el.options.map((opt) =>
            opt.id === optionId ? { ...opt, [block]: [...(opt[block] ?? []), { id: crypto.randomUUID(), label: "" }] } : opt,
          ),
        };
      }),
    );
  }

  function updateSubOption(elementId: string, optionId: string, subOptionId: string, label: string, block: OptionSubBlock = "subOptions") {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return {
          ...el,
          options: el.options.map((opt) =>
            opt.id === optionId
              ? { ...opt, [block]: (opt[block] ?? []).map((sub) => (sub.id === subOptionId ? { ...sub, label } : sub)) }
              : opt,
          ),
        };
      }),
    );
  }

  function removeSubOption(elementId: string, optionId: string, subOptionId: string, block: OptionSubBlock = "subOptions") {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return {
          ...el,
          options: el.options.map((opt) =>
            opt.id === optionId ? { ...opt, [block]: (opt[block] ?? []).filter((sub) => sub.id !== subOptionId) } : opt,
          ),
        };
      }),
    );
  }

  function addSubSubOption(elementId: string, optionId: string, subOptionId: string, block: OptionSubBlock = "subOptions") {
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
                  [block]: (opt[block] ?? []).map((sub) =>
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

  function updateSubSubOption(
    elementId: string,
    optionId: string,
    subOptionId: string,
    subSubOptionId: string,
    label: string,
    block: OptionSubBlock = "subOptions",
  ) {
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
                  [block]: (opt[block] ?? []).map((sub) =>
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

  function removeSubSubOption(
    elementId: string,
    optionId: string,
    subOptionId: string,
    subSubOptionId: string,
    block: OptionSubBlock = "subOptions",
  ) {
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
                  [block]: (opt[block] ?? []).map((sub) =>
                    sub.id === subOptionId ? { ...sub, subOptions: (sub.subOptions ?? []).filter((subsub) => subsub.id !== subSubOptionId) } : sub,
                  ),
                }
              : opt,
          ),
        };
      }),
    );
  }

  // Referencias de URL por opción (VS-039, docs/engines/form.md "Referencias
  // de URL por opción"): campo opcional adjunto a la opción de nivel 1 (no a
  // sub-opciones, ver "Fuera de alcance" del doc) — mismo patrón CRUD que
  // subOptions pero de un solo objeto, no un array.
  function addOptionReferences(elementId: string, optionId: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return { ...el, options: el.options.map((opt) => (opt.id === optionId ? { ...opt, references: {} } : opt)) };
      }),
    );
  }

  function removeOptionReferences(elementId: string, optionId: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return {
          ...el,
          options: el.options.map((opt) => {
            if (opt.id !== optionId) return opt;
            const { references: _references, ...rest } = opt;
            return rest;
          }),
        };
      }),
    );
  }

  function updateOptionReferencesMaxUrls(elementId: string, optionId: string, maxUrls: number | undefined) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return {
          ...el,
          options: el.options.map((opt) => (opt.id === optionId ? { ...opt, references: { ...opt.references, maxUrls } } : opt)),
        };
      }),
    );
  }

  // VS-041 (corrección posterior, docs/engines/form.md "Posición
  // configurable"): dónde aparece el bloque de URL respecto a las
  // sub-opciones — default (ausente) = antes, igual que el HTML real de S&P.
  function updateOptionReferencesPosition(
    elementId: string,
    optionId: string,
    position: "before_suboptions" | "after_suboptions" | undefined,
  ) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return {
          ...el,
          options: el.options.map((opt) => (opt.id === optionId ? { ...opt, references: { ...opt.references, position } } : opt)),
        };
      }),
    );
  }

  // VS-045 (docs/engines/form.md "Referencias flexibles"): un solo tipo por
  // bloque de referencias — "public" (URLs solamente, comportamiento
  // VS-039/040) o "flexible" (cada slot elige URL o documento interno).
  function updateOptionReferencesRefType(elementId: string, optionId: string, refType: "public" | "flexible" | undefined) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return {
          ...el,
          options: el.options.map((opt) => (opt.id === optionId ? { ...opt, references: { ...opt.references, refType } } : opt)),
        };
      }),
    );
  }

  // Tabla embebida directo en una opción de nivel superior (VS-060,
  // docs/engines/form.md "Tabla embebida directamente en una opción de nivel
  // superior"): mismo TableConfigEditor que subOption.table (VS-042), un
  // nivel menos de anidación — la opción misma, no una sub-opción.
  function addOptionTable(elementId: string, optionId: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        const colId = crypto.randomUUID();
        return {
          ...el,
          options: el.options.map((opt) =>
            opt.id === optionId
              ? {
                  ...opt,
                  table: {
                    columns: [{ id: colId }],
                    rows: [{ id: crypto.randomUUID(), cells: [{ columnId: colId, cellType: "texto" as const, editable: true }] }],
                  },
                }
              : opt,
          ),
        };
      }),
    );
  }

  function removeOptionTable(elementId: string, optionId: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return {
          ...el,
          options: el.options.map((opt) => {
            if (opt.id !== optionId) return opt;
            const { table: _table, ...rest } = opt;
            return rest;
          }),
        };
      }),
    );
  }

  function updateOptionTable(elementId: string, optionId: string, next: TablaDatosConfig) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return { ...el, options: el.options.map((opt) => (opt.id === optionId ? { ...opt, table: next } : opt)) };
      }),
    );
  }

  // VS-056 (docs/engines/form.md "Referencias a nivel de pregunta"): bloque
  // de referencias a nivel del Elemento (entre el texto de la pregunta y las
  // opciones), mismo shape que las de opción. Sin `position` — no hay
  // sub-opciones que ordenar a este nivel (el Runtime siempre lo renderiza
  // entre texto y opciones).
  function addElementReferences(elementId: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return { ...el, references: {} };
      }),
    );
  }

  function removeElementReferences(elementId: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        const { references: _references, ...rest } = el;
        return rest;
      }),
    );
  }

  function updateElementReferencesMaxUrls(elementId: string, maxUrls: number | undefined) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return { ...el, references: { ...el.references, maxUrls } };
      }),
    );
  }

  function updateElementReferencesRefType(elementId: string, refType: "public" | "flexible" | undefined) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return { ...el, references: { ...el.references, refType } };
      }),
    );
  }

  function toggleSubOptionsExclusive(elementId: string, optionId: string, exclusive: boolean) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return { ...el, options: el.options.map((opt) => (opt.id === optionId ? { ...opt, subOptionsExclusive: exclusive } : opt)) };
      }),
    );
  }

  // VS-046: exclusividad del bloque secundario, independiente de
  // subOptionsExclusive — nombre de campo distinto (secondaryOptionsExclusive),
  // por eso no comparte `block` con toggleSubOptionsExclusive.
  function toggleSecondaryOptionsExclusive(elementId: string, optionId: string, exclusive: boolean) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return {
          ...el,
          options: el.options.map((opt) => (opt.id === optionId ? { ...opt, secondaryOptionsExclusive: exclusive } : opt)),
        };
      }),
    );
  }

  // VS-046: encabezado propio del bloque secundario, ej. "Distribución de objetivos".
  function updateSecondaryOptionsHeading(elementId: string, optionId: string, heading: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return { ...el, options: el.options.map((opt) => (opt.id === optionId ? { ...opt, secondaryOptionsHeading: heading } : opt)) };
      }),
    );
  }

  // VS-046: inicia/quita el bloque secundario entero (array + heading +
  // exclusividad) — mismo patrón que addOptionReferences/removeOptionReferences.
  function addSecondaryOptionsBlock(elementId: string, optionId: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return {
          ...el,
          options: el.options.map((opt) => (opt.id === optionId ? { ...opt, secondaryOptions: [{ id: crypto.randomUUID(), label: "" }] } : opt)),
        };
      }),
    );
  }

  function removeSecondaryOptionsBlock(elementId: string, optionId: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return {
          ...el,
          options: el.options.map((opt) => {
            if (opt.id !== optionId) return opt;
            const { secondaryOptions: _secondaryOptions, secondaryOptionsHeading: _heading, secondaryOptionsExclusive: _exclusive, ...rest } = opt;
            return rest;
          }),
        };
      }),
    );
  }

  // Campos embebidos en sub-opciones + exclusividad (VS-040, docs/engines/form.md
  // "Campos embebidos en sub-opciones"): mismo patrón CRUD que references/subOptions
  // de nivel 1, pero un nivel más adentro (subOption, no formOption). Helper
  // compartido para no repetir el mismo recorrido anidado 7 veces. VS-046: gana
  // el mismo parámetro `block` que el grupo anterior, mismo criterio.
  type SubOption = NonNullable<Extract<FormElement, { type: "seleccion_unica" }>["options"][number]["subOptions"]>[number];
  type SubOptionField = NonNullable<SubOption["field"]>;

  function updateSubOptionNode(
    elementId: string,
    optionId: string,
    subOptionId: string,
    updater: (sub: SubOption) => SubOption,
    block: OptionSubBlock = "subOptions",
  ) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return {
          ...el,
          options: el.options.map((opt) =>
            opt.id === optionId
              ? { ...opt, [block]: (opt[block] ?? []).map((sub) => (sub.id === subOptionId ? updater(sub) : sub)) }
              : opt,
          ),
        };
      }),
    );
  }

  function addSubOptionReferences(elementId: string, optionId: string, subOptionId: string, block: OptionSubBlock = "subOptions") {
    updateSubOptionNode(elementId, optionId, subOptionId, (sub) => ({ ...sub, references: {} }), block);
  }

  // Tabla embebida en una sub-opción (VS-042, docs/engines/form.md "Tabla
  // dentro de una sub-opción"): mismo TableConfigEditor que el Elemento
  // tabla_datos, un nivel más adentro (subOption, no formOption).
  function addSubOptionTable(elementId: string, optionId: string, subOptionId: string, block: OptionSubBlock = "subOptions") {
    updateSubOptionNode(
      elementId,
      optionId,
      subOptionId,
      (sub) => {
        const colId = crypto.randomUUID();
        return {
          ...sub,
          table: {
            columns: [{ id: colId }],
            rows: [{ id: crypto.randomUUID(), cells: [{ columnId: colId, cellType: "texto", editable: true }] }],
          },
        };
      },
      block,
    );
  }

  function removeSubOptionTable(elementId: string, optionId: string, subOptionId: string, block: OptionSubBlock = "subOptions") {
    updateSubOptionNode(
      elementId,
      optionId,
      subOptionId,
      (sub) => {
        const { table: _table, ...rest } = sub;
        return rest;
      },
      block,
    );
  }

  function updateSubOptionTable(elementId: string, optionId: string, subOptionId: string, next: TablaDatosConfig, block: OptionSubBlock = "subOptions") {
    updateSubOptionNode(elementId, optionId, subOptionId, (sub) => ({ ...sub, table: next }), block);
  }

  function removeSubOptionReferences(elementId: string, optionId: string, subOptionId: string, block: OptionSubBlock = "subOptions") {
    updateSubOptionNode(
      elementId,
      optionId,
      subOptionId,
      (sub) => {
        const { references: _references, ...rest } = sub;
        return rest;
      },
      block,
    );
  }

  function updateSubOptionReferencesMaxUrls(
    elementId: string,
    optionId: string,
    subOptionId: string,
    maxUrls: number | undefined,
    block: OptionSubBlock = "subOptions",
  ) {
    updateSubOptionNode(elementId, optionId, subOptionId, (sub) => ({ ...sub, references: { ...sub.references, maxUrls } }), block);
  }

  function updateSubOptionReferencesPosition(
    elementId: string,
    optionId: string,
    subOptionId: string,
    position: "before_suboptions" | "after_suboptions" | undefined,
    block: OptionSubBlock = "subOptions",
  ) {
    updateSubOptionNode(elementId, optionId, subOptionId, (sub) => ({ ...sub, references: { ...sub.references, position } }), block);
  }

  // VS-045: refType de las referencias de una sub-opción (ver
  // updateOptionReferencesRefType arriba).
  function updateSubOptionReferencesRefType(
    elementId: string,
    optionId: string,
    subOptionId: string,
    refType: "public" | "flexible" | undefined,
    block: OptionSubBlock = "subOptions",
  ) {
    updateSubOptionNode(elementId, optionId, subOptionId, (sub) => ({ ...sub, references: { ...sub.references, refType } }), block);
  }

  function addSubOptionField(
    elementId: string,
    optionId: string,
    subOptionId: string,
    type: SubOptionField["type"],
    block: OptionSubBlock = "subOptions",
  ) {
    const field: SubOptionField =
      type === "seleccion_desplegable"
        ? { type: "seleccion_desplegable", options: [{ id: crypto.randomUUID(), label: "" }] }
        : type === "texto_corto"
          ? { type: "texto_corto" }
          : { type: "numero" };
    updateSubOptionNode(elementId, optionId, subOptionId, (sub) => ({ ...sub, field }), block);
  }

  function removeSubOptionField(elementId: string, optionId: string, subOptionId: string, block: OptionSubBlock = "subOptions") {
    updateSubOptionNode(
      elementId,
      optionId,
      subOptionId,
      (sub) => {
        const { field: _field, ...rest } = sub;
        return rest;
      },
      block,
    );
  }

  function updateSubOptionFieldMaxLength(
    elementId: string,
    optionId: string,
    subOptionId: string,
    maxLength: number | undefined,
    block: OptionSubBlock = "subOptions",
  ) {
    updateSubOptionNode(
      elementId,
      optionId,
      subOptionId,
      (sub) => (sub.field?.type === "texto_corto" ? { ...sub, field: { ...sub.field, maxLength } } : sub),
      block,
    );
  }

  function updateSubOptionFieldNumero(
    elementId: string,
    optionId: string,
    subOptionId: string,
    patch: { min?: number | undefined; max?: number | undefined; unit?: string | undefined },
    block: OptionSubBlock = "subOptions",
  ) {
    updateSubOptionNode(
      elementId,
      optionId,
      subOptionId,
      (sub) => (sub.field?.type === "numero" ? { ...sub, field: { ...sub.field, ...patch } } : sub),
      block,
    );
  }

  function addSubOptionFieldOption(elementId: string, optionId: string, subOptionId: string, block: OptionSubBlock = "subOptions") {
    updateSubOptionNode(
      elementId,
      optionId,
      subOptionId,
      (sub) =>
        sub.field?.type === "seleccion_desplegable"
          ? { ...sub, field: { ...sub.field, options: [...sub.field.options, { id: crypto.randomUUID(), label: "" }] } }
          : sub,
      block,
    );
  }

  function updateSubOptionFieldOption(
    elementId: string,
    optionId: string,
    subOptionId: string,
    fieldOptionId: string,
    label: string,
    block: OptionSubBlock = "subOptions",
  ) {
    updateSubOptionNode(
      elementId,
      optionId,
      subOptionId,
      (sub) =>
        sub.field?.type === "seleccion_desplegable"
          ? { ...sub, field: { ...sub.field, options: sub.field.options.map((o) => (o.id === fieldOptionId ? { ...o, label } : o)) } }
          : sub,
      block,
    );
  }

  function removeSubOptionFieldOption(
    elementId: string,
    optionId: string,
    subOptionId: string,
    fieldOptionId: string,
    block: OptionSubBlock = "subOptions",
  ) {
    updateSubOptionNode(
      elementId,
      optionId,
      subOptionId,
      (sub) =>
        sub.field?.type === "seleccion_desplegable" && sub.field.options.length > 1
          ? { ...sub, field: { ...sub.field, options: sub.field.options.filter((o) => o.id !== fieldOptionId) } }
          : sub,
      block,
    );
  }

  // Tabla de datos (VS-024 + VS-042): el CRUD de columnas/filas/options vive
  // en TableConfigEditor (componente compartido con la tabla embebida de una
  // sub-opción) — ver arriba, junto a formulaError.

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
                ? false // VS-048: sin label de columna/fila que pueda estar "incompleto"
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
                      {/* VS-045: labels con formato en todos los Elementos
                          (docs/engines/form.md); banner.label queda texto plano
                          (decisión VS-038: el título del banner no lleva HTML) */}
                      {el.type === "banner" ? (
                        <input
                          id={`element-label-${el.id}`}
                          value={el.label}
                          onChange={(e) => updateElement(el.id, { label: e.target.value })}
                          ref={(node) => {
                            labelRefs.current[el.id] = node;
                          }}
                        />
                      ) : (
                        <RichTextEditor
                          value={el.label}
                          onChange={(html) => updateElement(el.id, { label: html })}
                          ariaLabel={isQuestion(el) ? "Texto de la pregunta" : "Texto del elemento"}
                        />
                      )}
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
                              <div className="option-row__editor">
                                <RichTextEditor
                                  value={opt.label}
                                  onChange={(html) => updateOption(el.id, opt.id, html)}
                                  ariaLabel="Texto de la opción"
                                />
                              </div>
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
                          {/* VS-056 (docs/engines/form.md "Referencias a nivel de
                              pregunta"): bloque entre el texto de la pregunta y
                              las opciones, mismo shape que las de opción pero a
                              nivel de Elemento. Sin posición configurable — el
                              Runtime siempre lo renderiza entre texto y opciones. */}
                          <div className="option-references">
                            {el.references ? (
                              <div className="option-row">
                                <label className="field">
                                  <span className="field__label">Máximo de URLs</span>
                                  <input
                                    type="number"
                                    min={1}
                                    value={el.references.maxUrls ?? ""}
                                    placeholder="3"
                                    onChange={(e) =>
                                      updateElementReferencesMaxUrls(
                                        el.id,
                                        e.target.value === "" ? undefined : Number(e.target.value),
                                      )
                                    }
                                  />
                                </label>
                                <label className="field">
                                  <span className="field__label">Tipo de referencia</span>
                                  <select
                                    value={el.references.refType ?? "public"}
                                    onChange={(e) =>
                                      updateElementReferencesRefType(
                                        el.id,
                                        e.target.value === "flexible" ? "flexible" : undefined,
                                      )
                                    }
                                  >
                                    <option value="public">URL pública</option>
                                    <option value="flexible">Flexible (URL o documento interno)</option>
                                  </select>
                                </label>
                                <Button
                                  type="button"
                                  variant="danger"
                                  size="sm"
                                  onClick={() => removeElementReferences(el.id)}
                                >
                                  Quitar referencias
                                </Button>
                              </div>
                            ) : (
                              <Button type="button" size="sm" onClick={() => addElementReferences(el.id)}>
                                Agregar referencias
                              </Button>
                            )}
                          </div>
                          <span className="options__label">Opciones</span>
                          {el.options.map((opt) => (
                            <div className="option-row-group" key={opt.id}>
                              <div className="option-row">
                                <div className="option-row__editor">
                                  <RichTextEditor
                                    value={opt.label}
                                    onChange={(html) => updateOption(el.id, opt.id, html)}
                                    ariaLabel="Texto de la opción"
                                  />
                                </div>
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
                                {(opt.subOptions?.length ?? 0) > 0 && (
                                  <label className="field field--checkbox">
                                    <input
                                      type="checkbox"
                                      checked={opt.subOptionsExclusive ?? false}
                                      onChange={(e) => toggleSubOptionsExclusive(el.id, opt.id, e.target.checked)}
                                    />
                                    <span className="field__label">Sub-opciones excluyentes (solo una a la vez)</span>
                                  </label>
                                )}
                                {(opt.subOptions ?? []).map((sub) => (
                                  <div key={sub.id}>
                                    <div className="option-row option-row--sub">
                                      <div className="option-row__editor">
                                        <RichTextEditor
                                          value={sub.label}
                                          onChange={(html) => updateSubOption(el.id, opt.id, sub.id, html)}
                                          ariaLabel="Texto de la sub-opción"
                                        />
                                      </div>
                                      <Button
                                        type="button"
                                        variant="danger"
                                        size="sm"
                                        onClick={() => removeSubOption(el.id, opt.id, sub.id)}
                                      >
                                        Quitar
                                      </Button>
                                    </div>
                                    <div className="sub-option-field" style={{ marginLeft: "var(--space-4)" }}>
                                      {sub.field ? (
                                        <div className="option-row">
                                          <span className="field__label">
                                            {sub.field.type === "seleccion_desplegable" && "Campo: selección desplegable"}
                                            {sub.field.type === "texto_corto" && "Campo: texto corto"}
                                            {sub.field.type === "numero" && "Campo: número"}
                                          </span>
                                          <Button
                                            type="button"
                                            variant="danger"
                                            size="sm"
                                            onClick={() => removeSubOptionField(el.id, opt.id, sub.id)}
                                          >
                                            Quitar campo
                                          </Button>
                                        </div>
                                      ) : (
                                        <select
                                          value=""
                                          onChange={(e) => {
                                            if (e.target.value) {
                                              addSubOptionField(el.id, opt.id, sub.id, e.target.value as SubOptionField["type"]);
                                            }
                                          }}
                                        >
                                          <option value="">Agregar campo…</option>
                                          <option value="seleccion_desplegable">Selección desplegable</option>
                                          <option value="texto_corto">Texto corto</option>
                                          <option value="numero">Número</option>
                                        </select>
                                      )}
                                      {sub.field?.type === "seleccion_desplegable" &&
                                        (() => {
                                          const selectField = sub.field;
                                          return (
                                            <div className="options" style={{ marginLeft: "var(--space-4)" }}>
                                              {selectField.options.map((fo) => (
                                                <div className="option-row" key={fo.id}>
                                                  <div className="option-row__editor">
                                                    <RichTextEditor
                                                      value={fo.label}
                                                      onChange={(html) => updateSubOptionFieldOption(el.id, opt.id, sub.id, fo.id, html)}
                                                      ariaLabel="Texto de la opción del campo"
                                                    />
                                                  </div>
                                                  <Button
                                                    type="button"
                                                    variant="danger"
                                                    size="sm"
                                                    onClick={() => removeSubOptionFieldOption(el.id, opt.id, sub.id, fo.id)}
                                                    disabled={selectField.options.length <= 1}
                                                  >
                                                    Quitar
                                                  </Button>
                                                </div>
                                              ))}
                                              <Button type="button" size="sm" onClick={() => addSubOptionFieldOption(el.id, opt.id, sub.id)}>
                                                Agregar opción
                                              </Button>
                                            </div>
                                          );
                                        })()}
                                      {sub.field?.type === "texto_corto" && (
                                        <label className="field" style={{ marginLeft: "var(--space-4)" }}>
                                          <span className="field__label">Longitud máxima</span>
                                          <input
                                            type="number"
                                            value={sub.field.maxLength ?? ""}
                                            onChange={(e) =>
                                              updateSubOptionFieldMaxLength(
                                                el.id,
                                                opt.id,
                                                sub.id,
                                                e.target.value === "" ? undefined : Number(e.target.value),
                                              )
                                            }
                                          />
                                        </label>
                                      )}
                                      {sub.field?.type === "numero" && (
                                        <div className="field-grid" style={{ marginLeft: "var(--space-4)" }}>
                                          <label className="field">
                                            <span className="field__label">Mínimo</span>
                                            <input
                                              type="number"
                                              value={sub.field.min ?? ""}
                                              onChange={(e) =>
                                                updateSubOptionFieldNumero(el.id, opt.id, sub.id, {
                                                  min: e.target.value === "" ? undefined : Number(e.target.value),
                                                })
                                              }
                                            />
                                          </label>
                                          <label className="field">
                                            <span className="field__label">Máximo</span>
                                            <input
                                              type="number"
                                              value={sub.field.max ?? ""}
                                              onChange={(e) =>
                                                updateSubOptionFieldNumero(el.id, opt.id, sub.id, {
                                                  max: e.target.value === "" ? undefined : Number(e.target.value),
                                                })
                                              }
                                            />
                                          </label>
                                          <label className="field">
                                            <span className="field__label">Unidad</span>
                                            <input
                                              value={sub.field.unit ?? ""}
                                              onChange={(e) =>
                                                updateSubOptionFieldNumero(el.id, opt.id, sub.id, {
                                                  unit: e.target.value === "" ? undefined : e.target.value,
                                                })
                                              }
                                            />
                                          </label>
                                        </div>
                                      )}
                                    </div>
                                    {/* VS-042: tabla embebida — mismo
                                        TableConfigEditor que tabla_datos */}
                                    <div style={{ marginLeft: "var(--space-4)" }}>
                                      {sub.table ? (
                                        <div className="option-row-group">
                                          <div className="option-row">
                                            <span className="field__label">Tabla embebida</span>
                                            <Button
                                              type="button"
                                              variant="danger"
                                              size="sm"
                                              onClick={() => removeSubOptionTable(el.id, opt.id, sub.id)}
                                            >
                                              Quitar tabla
                                            </Button>
                                          </div>
                                          <TableConfigEditor
                                            columns={sub.table.columns}
                                            rows={sub.table.rows}
                                            onChange={(next) => updateSubOptionTable(el.id, opt.id, sub.id, next)}
                                          />
                                        </div>
                                      ) : (
                                        <Button type="button" size="sm" onClick={() => addSubOptionTable(el.id, opt.id, sub.id)}>
                                          Agregar tabla
                                        </Button>
                                      )}
                                    </div>
                                    <div className="option-references" style={{ marginLeft: "var(--space-4)" }}>
                                      {sub.references ? (
                                        <div className="option-row">
                                          <label className="field">
                                            <span className="field__label">Máximo de URLs</span>
                                            <input
                                              type="number"
                                              min={1}
                                              value={sub.references.maxUrls ?? ""}
                                              placeholder="3"
                                              onChange={(e) =>
                                                updateSubOptionReferencesMaxUrls(
                                                  el.id,
                                                  opt.id,
                                                  sub.id,
                                                  e.target.value === "" ? undefined : Number(e.target.value),
                                                )
                                              }
                                            />
                                          </label>
                                          <label className="field">
                                            <span className="field__label">Posición de las URLs</span>
                                            <select
                                              value={sub.references.position ?? "before_suboptions"}
                                              onChange={(e) =>
                                                updateSubOptionReferencesPosition(
                                                  el.id,
                                                  opt.id,
                                                  sub.id,
                                                  e.target.value === "after_suboptions" ? "after_suboptions" : undefined,
                                                )
                                              }
                                            >
                                              <option value="before_suboptions">Antes de las sub-opciones</option>
                                              <option value="after_suboptions">Después de las sub-opciones</option>
                                            </select>
                                          </label>
                                          <label className="field">
                                            <span className="field__label">Tipo de referencia</span>
                                            <select
                                              value={sub.references.refType ?? "public"}
                                              onChange={(e) =>
                                                updateSubOptionReferencesRefType(
                                                  el.id,
                                                  opt.id,
                                                  sub.id,
                                                  e.target.value === "flexible" ? "flexible" : undefined,
                                                )
                                              }
                                            >
                                              <option value="public">URL pública</option>
                                              <option value="flexible">Flexible (URL o documento interno)</option>
                                            </select>
                                          </label>
                                          <Button
                                            type="button"
                                            variant="danger"
                                            size="sm"
                                            onClick={() => removeSubOptionReferences(el.id, opt.id, sub.id)}
                                          >
                                            Quitar referencias
                                          </Button>
                                        </div>
                                      ) : (
                                        <Button type="button" size="sm" onClick={() => addSubOptionReferences(el.id, opt.id, sub.id)}>
                                          Agregar referencias
                                        </Button>
                                      )}
                                    </div>
                                    <div className="sub-options" style={{ marginLeft: "var(--space-4)" }}>
                                      {(sub.subOptions ?? []).map((subsub) => (
                                        <div className="option-row option-row--subsub" key={subsub.id}>
                                          <div className="option-row__editor">
                                            <RichTextEditor
                                              value={subsub.label}
                                              onChange={(html) => updateSubSubOption(el.id, opt.id, sub.id, subsub.id, html)}
                                              ariaLabel="Texto de la sub-sub-opción"
                                            />
                                          </div>
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
                              {/* VS-046 (docs/engines/form.md "Bloque secundario de
                                  sub-opciones por opción"): bloque HERMANO de
                                  `subOptions` arriba, no anidado dentro de él —
                                  caso real: sub-radio StockExchange + grupo de
                                  checkboxes "Distribución de objetivos" bajo la
                                  misma opción. Mismo CRUD que subOptions, mismas
                                  funciones con block="secondaryOptions". */}
                              <div className="sub-options">
                                {opt.secondaryOptions ? (
                                  <>
                                    <div className="option-row">
                                      <label className="field" style={{ flex: 1 }}>
                                        <span className="field__label">Encabezado del bloque secundario</span>
                                        <RichTextEditor
                                          value={opt.secondaryOptionsHeading ?? ""}
                                          onChange={(html) => updateSecondaryOptionsHeading(el.id, opt.id, html)}
                                          ariaLabel="Encabezado del bloque secundario de sub-opciones"
                                        />
                                      </label>
                                      <Button
                                        type="button"
                                        variant="danger"
                                        size="sm"
                                        onClick={() => removeSecondaryOptionsBlock(el.id, opt.id)}
                                      >
                                        Quitar bloque secundario
                                      </Button>
                                    </div>
                                    {(opt.secondaryOptions?.length ?? 0) > 0 && (
                                      <label className="field field--checkbox">
                                        <input
                                          type="checkbox"
                                          checked={opt.secondaryOptionsExclusive ?? false}
                                          onChange={(e) => toggleSecondaryOptionsExclusive(el.id, opt.id, e.target.checked)}
                                        />
                                        <span className="field__label">Sub-opciones excluyentes (solo una a la vez)</span>
                                      </label>
                                    )}
                                    {(opt.secondaryOptions ?? []).map((sub) => (
                                      <div key={sub.id}>
                                        <div className="option-row option-row--sub">
                                          <div className="option-row__editor">
                                            <RichTextEditor
                                              value={sub.label}
                                              onChange={(html) => updateSubOption(el.id, opt.id, sub.id, html, "secondaryOptions")}
                                              ariaLabel="Texto de la sub-opción"
                                            />
                                          </div>
                                          <Button
                                            type="button"
                                            variant="danger"
                                            size="sm"
                                            onClick={() => removeSubOption(el.id, opt.id, sub.id, "secondaryOptions")}
                                          >
                                            Quitar
                                          </Button>
                                        </div>
                                        <div className="sub-option-field" style={{ marginLeft: "var(--space-4)" }}>
                                          {sub.field ? (
                                            <div className="option-row">
                                              <span className="field__label">
                                                {sub.field.type === "seleccion_desplegable" && "Campo: selección desplegable"}
                                                {sub.field.type === "texto_corto" && "Campo: texto corto"}
                                                {sub.field.type === "numero" && "Campo: número"}
                                              </span>
                                              <Button
                                                type="button"
                                                variant="danger"
                                                size="sm"
                                                onClick={() => removeSubOptionField(el.id, opt.id, sub.id, "secondaryOptions")}
                                              >
                                                Quitar campo
                                              </Button>
                                            </div>
                                          ) : (
                                            <select
                                              value=""
                                              onChange={(e) => {
                                                if (e.target.value) {
                                                  addSubOptionField(el.id, opt.id, sub.id, e.target.value as SubOptionField["type"], "secondaryOptions");
                                                }
                                              }}
                                            >
                                              <option value="">Agregar campo…</option>
                                              <option value="seleccion_desplegable">Selección desplegable</option>
                                              <option value="texto_corto">Texto corto</option>
                                              <option value="numero">Número</option>
                                            </select>
                                          )}
                                          {sub.field?.type === "seleccion_desplegable" &&
                                            (() => {
                                              const selectField = sub.field;
                                              return (
                                                <div className="options" style={{ marginLeft: "var(--space-4)" }}>
                                                  {selectField.options.map((fo) => (
                                                    <div className="option-row" key={fo.id}>
                                                      <div className="option-row__editor">
                                                        <RichTextEditor
                                                          value={fo.label}
                                                          onChange={(html) =>
                                                            updateSubOptionFieldOption(el.id, opt.id, sub.id, fo.id, html, "secondaryOptions")
                                                          }
                                                          ariaLabel="Texto de la opción del campo"
                                                        />
                                                      </div>
                                                      <Button
                                                        type="button"
                                                        variant="danger"
                                                        size="sm"
                                                        onClick={() => removeSubOptionFieldOption(el.id, opt.id, sub.id, fo.id, "secondaryOptions")}
                                                        disabled={selectField.options.length <= 1}
                                                      >
                                                        Quitar
                                                      </Button>
                                                    </div>
                                                  ))}
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    onClick={() => addSubOptionFieldOption(el.id, opt.id, sub.id, "secondaryOptions")}
                                                  >
                                                    Agregar opción
                                                  </Button>
                                                </div>
                                              );
                                            })()}
                                          {sub.field?.type === "texto_corto" && (
                                            <label className="field" style={{ marginLeft: "var(--space-4)" }}>
                                              <span className="field__label">Longitud máxima</span>
                                              <input
                                                type="number"
                                                value={sub.field.maxLength ?? ""}
                                                onChange={(e) =>
                                                  updateSubOptionFieldMaxLength(
                                                    el.id,
                                                    opt.id,
                                                    sub.id,
                                                    e.target.value === "" ? undefined : Number(e.target.value),
                                                    "secondaryOptions",
                                                  )
                                                }
                                              />
                                            </label>
                                          )}
                                          {sub.field?.type === "numero" && (
                                            <div className="field-grid" style={{ marginLeft: "var(--space-4)" }}>
                                              <label className="field">
                                                <span className="field__label">Mínimo</span>
                                                <input
                                                  type="number"
                                                  value={sub.field.min ?? ""}
                                                  onChange={(e) =>
                                                    updateSubOptionFieldNumero(
                                                      el.id,
                                                      opt.id,
                                                      sub.id,
                                                      { min: e.target.value === "" ? undefined : Number(e.target.value) },
                                                      "secondaryOptions",
                                                    )
                                                  }
                                                />
                                              </label>
                                              <label className="field">
                                                <span className="field__label">Máximo</span>
                                                <input
                                                  type="number"
                                                  value={sub.field.max ?? ""}
                                                  onChange={(e) =>
                                                    updateSubOptionFieldNumero(
                                                      el.id,
                                                      opt.id,
                                                      sub.id,
                                                      { max: e.target.value === "" ? undefined : Number(e.target.value) },
                                                      "secondaryOptions",
                                                    )
                                                  }
                                                />
                                              </label>
                                              <label className="field">
                                                <span className="field__label">Unidad</span>
                                                <input
                                                  value={sub.field.unit ?? ""}
                                                  onChange={(e) =>
                                                    updateSubOptionFieldNumero(
                                                      el.id,
                                                      opt.id,
                                                      sub.id,
                                                      { unit: e.target.value === "" ? undefined : e.target.value },
                                                      "secondaryOptions",
                                                    )
                                                  }
                                                />
                                              </label>
                                            </div>
                                          )}
                                        </div>
                                        <div className="option-references" style={{ marginLeft: "var(--space-4)" }}>
                                          {sub.references ? (
                                            <div className="option-row">
                                              <label className="field">
                                                <span className="field__label">Máximo de URLs</span>
                                                <input
                                                  type="number"
                                                  min={1}
                                                  value={sub.references.maxUrls ?? ""}
                                                  placeholder="3"
                                                  onChange={(e) =>
                                                    updateSubOptionReferencesMaxUrls(
                                                      el.id,
                                                      opt.id,
                                                      sub.id,
                                                      e.target.value === "" ? undefined : Number(e.target.value),
                                                      "secondaryOptions",
                                                    )
                                                  }
                                                />
                                              </label>
                                              <label className="field">
                                                <span className="field__label">Tipo de referencia</span>
                                                <select
                                                  value={sub.references.refType ?? "public"}
                                                  onChange={(e) =>
                                                    updateSubOptionReferencesRefType(
                                                      el.id,
                                                      opt.id,
                                                      sub.id,
                                                      e.target.value === "flexible" ? "flexible" : undefined,
                                                      "secondaryOptions",
                                                    )
                                                  }
                                                >
                                                  <option value="public">URL pública</option>
                                                  <option value="flexible">Flexible (URL o documento interno)</option>
                                                </select>
                                              </label>
                                              <Button
                                                type="button"
                                                variant="danger"
                                                size="sm"
                                                onClick={() => removeSubOptionReferences(el.id, opt.id, sub.id, "secondaryOptions")}
                                              >
                                                Quitar referencias
                                              </Button>
                                            </div>
                                          ) : (
                                            <Button
                                              type="button"
                                              size="sm"
                                              onClick={() => addSubOptionReferences(el.id, opt.id, sub.id, "secondaryOptions")}
                                            >
                                              Agregar referencias
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                    <Button type="button" size="sm" onClick={() => addSubOption(el.id, opt.id, "secondaryOptions")}>
                                      Agregar sub-opción
                                    </Button>
                                  </>
                                ) : (
                                  <Button type="button" size="sm" onClick={() => addSecondaryOptionsBlock(el.id, opt.id)}>
                                    Agregar bloque secundario de sub-opciones
                                  </Button>
                                )}
                              </div>
                              {/* VS-060 (docs/engines/form.md "Tabla embebida
                                  directamente en una opción de nivel
                                  superior"): mismo TableConfigEditor que
                                  subOption.table (VS-042). */}
                              <div style={{ marginTop: "var(--space-2)" }}>
                                {opt.table ? (
                                  <div className="option-row-group">
                                    <div className="option-row">
                                      <span className="field__label">Tabla embebida</span>
                                      <Button type="button" variant="danger" size="sm" onClick={() => removeOptionTable(el.id, opt.id)}>
                                        Quitar tabla
                                      </Button>
                                    </div>
                                    <TableConfigEditor
                                      columns={opt.table.columns}
                                      rows={opt.table.rows}
                                      onChange={(next) => updateOptionTable(el.id, opt.id, next)}
                                    />
                                  </div>
                                ) : (
                                  <Button type="button" size="sm" onClick={() => addOptionTable(el.id, opt.id)}>
                                    Agregar tabla
                                  </Button>
                                )}
                              </div>
                              <div className="option-references">
                                {opt.references ? (
                                  <div className="option-row">
                                    <label className="field">
                                      <span className="field__label">Máximo de URLs</span>
                                      <input
                                        type="number"
                                        min={1}
                                        value={opt.references.maxUrls ?? ""}
                                        placeholder="3"
                                        onChange={(e) =>
                                          updateOptionReferencesMaxUrls(
                                            el.id,
                                            opt.id,
                                            e.target.value === "" ? undefined : Number(e.target.value),
                                          )
                                        }
                                      />
                                    </label>
                                    <label className="field">
                                        <span className="field__label">Posición de las URLs</span>
                                        <select
                                          value={opt.references.position ?? "before_suboptions"}
                                          onChange={(e) =>
                                            updateOptionReferencesPosition(
                                              el.id,
                                              opt.id,
                                              e.target.value === "after_suboptions" ? "after_suboptions" : undefined,
                                            )
                                          }
                                        >
                                          <option value="before_suboptions">Antes de las sub-opciones</option>
                                          <option value="after_suboptions">Después de las sub-opciones</option>
                                        </select>
                                      </label>
                                      <label className="field">
                                        <span className="field__label">Tipo de referencia</span>
                                        <select
                                          value={opt.references.refType ?? "public"}
                                          onChange={(e) =>
                                            updateOptionReferencesRefType(
                                              el.id,
                                              opt.id,
                                              e.target.value === "flexible" ? "flexible" : undefined,
                                            )
                                          }
                                        >
                                          <option value="public">URL pública</option>
                                          <option value="flexible">Flexible (URL o documento interno)</option>
                                        </select>
                                      </label>
                                    <Button
                                      type="button"
                                      variant="danger"
                                      size="sm"
                                      onClick={() => removeOptionReferences(el.id, opt.id)}
                                    >
                                      Quitar referencias
                                    </Button>
                                  </div>
                                ) : (
                                  <Button type="button" size="sm" onClick={() => addOptionReferences(el.id, opt.id)}>
                                    Agregar referencias
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                          <Button type="button" size="sm" onClick={() => addOption(el.id)}>
                            Agregar opción
                          </Button>
                        </div>
                      )}

                      {el.type === "tabla_datos" && (
                        <TableConfigEditor
                          columns={el.columns}
                          rows={el.rows}
                          onChange={(next) => updateElement(el.id, { columns: next.columns, rows: next.rows })}
                        />
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