"use client";

import {
  FormulaSyntaxError,
  componentRegistry,
  normalizeCellComponents,
  parseFormula,
  questionNumber,
  stripCommentHtml,
  type Condition,
  type FormElement,
  type Subindicator,
  type TableCellComponent,
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

// VS-076 (docs/engines/form.md "Fase 2: Builder emite components reales"):
// tarjetas arrastrables del panel lateral — ahora cada una crea un
// `TableCellComponent` independiente, agregado al array `components` de la
// celda (nunca reemplaza lo que ya había, a diferencia de la Fase 1/VS-071).
// "Calculado" ya puede arrastrarse como el resto: el riesgo que justificaba
// tratarlo aparte en Fase 1 (perder configuración por un drop accidental)
// no existe más — arrastrar siempre AGREGA, nunca reemplaza. `create()` en
// vez de un objeto estático: cada drop necesita ids frescos propios (ej. la
// opción default de "seleccion_desplegable"), no uno compartido entre todos
// los drops de la sesión.
type CellPaletteItem = { key: string; label: string; create: () => Omit<TableCellComponent, "id"> };

const CELL_PALETTE_ITEMS: CellPaletteItem[] = [
  { key: "fixed", label: "Texto fijo", create: () => ({ type: "texto_fijo" }) },
  { key: "texto", label: "Campo de texto", create: () => ({ type: "texto_corto" }) },
  { key: "numero", label: "Número", create: () => ({ type: "numero" }) },
  {
    key: "seleccion_desplegable",
    label: "Selección desplegable",
    create: () => ({ type: "seleccion_desplegable", options: [{ id: crypto.randomUUID(), label: "" }] }),
  },
  { key: "casilla", label: "Casilla de verificación", create: () => ({ type: "casilla" }) },
  { key: "referencia", label: "Referencia (archivo o enlace)", create: () => ({ type: "referencia" }) },
  { key: "calculado", label: "Calculado", create: () => ({ type: "calculado", expression: "" }) },
];

// VS-076: etiqueta humana + extracto de texto por TIPO DE COMPONENTE (antes
// era por celda completa, VS-066/071) — cada componente es su propio chip
// ahora, no la celda entera.
const COMPONENT_TYPE_LABEL: Record<TableCellComponent["type"], string> = {
  texto_fijo: "Texto fijo",
  texto_corto: "Campo de texto",
  numero: "Número",
  seleccion_desplegable: "Selección",
  casilla: "Casilla",
  referencia: "Referencia",
  calculado: "Calculado",
};

function componentPreviewText(component: TableCellComponent): string | undefined {
  const candidates: (string | undefined)[] = [
    component.type === "texto_fijo" ? component.content : undefined,
    component.type === "casilla" ? component.checkboxLabel : undefined,
    component.type === "calculado" ? component.expression : undefined,
    "label" in component ? component.label : undefined,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const plain = stripCommentHtml(raw).trim();
    if (!plain) continue;
    return plain.length > 30 ? `${plain.slice(0, 30)}…` : plain;
  }
  return undefined;
}

// VS-073 (docs/engines/form.md "Selección de celdas y Combinar/Separar
// celdas"): rango de ids de columna entre dos columnas de la misma fila,
// inclusive en ambos extremos, en el orden real de `columns` (no en el
// orden en que el usuario las arrastró/clickeó).
function columnIdRange(columns: TableConfigColumns, fromColumnId: string, toColumnId: string): string[] {
  const fromIdx = columns.findIndex((c) => c.id === fromColumnId);
  const toIdx = columns.findIndex((c) => c.id === toColumnId);
  if (fromIdx === -1 || toIdx === -1) return [fromColumnId];
  const [lo, hi] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
  return columns.slice(lo, hi + 1).map((c) => c.id);
}

function TableConfigEditor({
  columns,
  rows,
  onChange,
}: {
  columns: TableConfigColumns;
  rows: TableConfigRows;
  onChange: (next: { columns: TableConfigColumns; rows: TableConfigRows }) => void;
}) {
  // VS-076: qué COMPONENTE (no celda entera, desde Fase 2) tiene su popover
  // de configuración expandido — clave `${rowId}:${columnId}:${componentId}`,
  // estado local, no persistido (mismo criterio que sectionOverrides).
  const [expandedComponent, setExpandedComponent] = useState<string | null>(null);

  // VS-071: tarjeta de la paleta lateral actualmente arrastrada, y celda
  // bajo el cursor mientras dura el arrastre (solo para feedback visual).
  const [draggedItem, setDraggedItem] = useState<CellPaletteItem | null>(null);
  const [dragOverCellKey, setDragOverCellKey] = useState<string | null>(null);

  // VS-076: componente siendo arrastrado DENTRO de una celda para
  // reordenar — scope propio, distinto de `draggedItem` (paleta → celda,
  // que siempre AGREGA). Solo se acepta un drop de reordenamiento si el
  // componente de origen y el de destino son de la MISMA celda.
  // `useRef`, no `useState`: `onDragStart` y el `onDragOver`/`onDrop` que lo
  // consultan pueden dispararse en la misma ráfaga de eventos nativos antes
  // de que React llegue a re-renderizar — un state quedaría leyendo el
  // valor de UN render atrás (bug real encontrado verificando en
  // producción: el primer `dragover` nunca alcanzaba a ver el
  // `draggedComponentRef` recién seteado, así que nunca llamaba
  // `preventDefault()` y el navegador rechazaba el drop entero). Un ref se
  // lee siempre al valor actual, sin depender del ciclo de render.
  const draggedComponentRef = useRef<{ rowId: string; columnId: string; componentId: string } | null>(null);

  // VS-073: selección de celdas adyacentes de UNA fila para combinar/separar
  // — `selectionAnchor` es la celda donde empezó la selección (click o
  // mousedown), `selection` es el rango resultante (se recalcula contra
  // `selectionAnchor` en cada extensión, nunca se acumula a mano).
  const [selectionAnchor, setSelectionAnchor] = useState<{ rowId: string; columnId: string } | null>(null);
  const [selection, setSelection] = useState<{ rowId: string; columnIds: string[] } | null>(null);
  const [isMouseSelecting, setIsMouseSelecting] = useState(false);

  // Selección por arrastre de mouse (sin Shift): termina al soltar el botón
  // en CUALQUIER parte de la página, no solo sobre una celda — un listener
  // global es la única forma confiable de detectar eso.
  useEffect(() => {
    if (!isMouseSelecting) return;
    const stop = () => setIsMouseSelecting(false);
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, [isMouseSelecting]);

  function clearSelection() {
    setSelection(null);
    setSelectionAnchor(null);
  }

  function startSelection(rowId: string, columnId: string) {
    setSelectionAnchor({ rowId, columnId });
    setSelection({ rowId, columnIds: [columnId] });
  }

  function extendSelection(rowId: string, columnId: string) {
    setSelectionAnchor((anchor) => {
      if (!anchor || anchor.rowId !== rowId) return anchor;
      setSelection({ rowId, columnIds: columnIdRange(columns, anchor.columnId, columnId) });
      return anchor;
    });
  }

  function handleCellMouseDown(e: React.MouseEvent, rowId: string, columnId: string) {
    if (e.shiftKey && selectionAnchor?.rowId === rowId) {
      extendSelection(rowId, columnId);
      return;
    }
    setIsMouseSelecting(true);
    startSelection(rowId, columnId);
  }

  function handleCellMouseEnter(rowId: string, columnId: string) {
    if (!isMouseSelecting) return;
    extendSelection(rowId, columnId);
  }

  function combineSelection() {
    if (!selection || selection.columnIds.length < 2) return;
    updateCellColSpan(selection.rowId, selection.columnIds[0]!, selection.columnIds.length);
    clearSelection();
  }

  function separateSelection() {
    if (!selection || selection.columnIds.length !== 1) return;
    updateCellColSpan(selection.rowId, selection.columnIds[0]!, undefined);
    clearSelection();
  }

  // VS-076 (docs/engines/form.md "Fase 2: Builder emite components
  // reales"): primer cambio del admin sobre una celda LEGACY (sin
  // `components` propio) la materializa completa — toma el equivalente
  // sintetizado por `normalizeCellComponents` y regenera sus ids
  // deterministas (`legacy-*`) a `randomUUID()` reales, remapeando también
  // los `gates` de una casilla para que sigan apuntando a sus hermanos
  // correctos. A partir de acá es una celda "nueva": reordenar/eliminar/
  // agregar componentes ya no tiene ambigüedad de qué respuesta ya guardada
  // corresponde a cuál (a diferencia de `extraFields`, indexado por
  // posición — ver "Fuera de alcance" de VS-071/073).
  function materializeComponents(cell: TableConfigCell): TableCellComponent[] {
    if (cell.components?.length) return cell.components;
    const synthesized = normalizeCellComponents(cell);
    const idMap = new Map(synthesized.map((c) => [c.id, crypto.randomUUID()]));
    return synthesized.map((c) => {
      const id = idMap.get(c.id)!;
      return c.type === "casilla" && c.gates ? { ...c, id, gates: c.gates.map((g) => idMap.get(g) ?? g) } : { ...c, id };
    });
  }

  // Guarda el array `components` de una celda — vacío = quitar la celda
  // entera (mismo resultado que "Quitar celda" ya existente; una celda sin
  // ningún componente no tiene nada que mostrar).
  function setCellComponents(rowId: string, columnId: string, components: TableCellComponent[]) {
    if (components.length === 0) {
      removeCell(rowId, columnId);
      return;
    }
    updateCell(rowId, columnId, { components });
  }

  function addComponentToCell(rowId: string, columnId: string, cell: TableConfigCell | undefined, template: Omit<TableCellComponent, "id">) {
    const base = cell ? materializeComponents(cell) : [];
    const created = { ...template, id: crypto.randomUUID() } as TableCellComponent;
    setCellComponents(rowId, columnId, [...base, created]);
    setExpandedComponent(`${rowId}:${columnId}:${created.id}`);
  }

  function removeComponentFromCell(rowId: string, columnId: string, cell: TableConfigCell, componentId: string) {
    const base = materializeComponents(cell);
    const next = base
      .filter((c) => c.id !== componentId)
      .map((c) => (c.type === "casilla" && c.gates ? { ...c, gates: c.gates.filter((g) => g !== componentId) } : c));
    setCellComponents(rowId, columnId, next);
  }

  function updateComponentInCell(rowId: string, columnId: string, cell: TableConfigCell, componentId: string, patch: Record<string, unknown>) {
    const base = materializeComponents(cell);
    const next = base.map((c) => (c.id === componentId ? ({ ...c, ...patch } as TableCellComponent) : c));
    setCellComponents(rowId, columnId, next);
  }

  // Drag & drop nativo para reordenar DENTRO de una celda — mismo patrón
  // que VS-049 (builder de jerarquía), scope = `${rowId}:${columnId}` para
  // que un componente nunca se pueda "soltar" en otra celda.
  function reorderComponentInCell(rowId: string, columnId: string, cell: TableConfigCell, fromId: string, toId: string) {
    const base = materializeComponents(cell);
    const fromIdx = base.findIndex((c) => c.id === fromId);
    const toIdx = base.findIndex((c) => c.id === toId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const next = [...base];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved!);
    setCellComponents(rowId, columnId, next);
  }

  // Un componente "casilla" revela a otros de la MISMA celda por id propio
  // (`gates`) — reemplaza la regla implícita legacy ("extraFields siempre
  // gated si cellType === casilla"), ver docs/engines/form.md.
  function toggleComponentGate(rowId: string, columnId: string, cell: TableConfigCell, casillaId: string, targetId: string) {
    const base = materializeComponents(cell);
    const next = base.map((c) => {
      if (c.id !== casillaId || c.type !== "casilla") return c;
      const gates = c.gates ?? [];
      return { ...c, gates: gates.includes(targetId) ? gates.filter((g) => g !== targetId) : [...gates, targetId] };
    });
    setCellComponents(rowId, columnId, next);
  }

  // VS-076: soltar una tarjeta de la paleta siempre AGREGA un componente al
  // final del array de esa celda — nunca reemplaza (a diferencia de la
  // Fase 1/VS-071, cuyo modelo de 1-control-por-celda sí necesitaba
  // confirmación de reemplazo). Sin `window.confirm`: ya no hay nada que
  // perder.
  function handleCellDrop(e: React.DragEvent, rowId: string, columnId: string) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCellKey(null);
    const item = draggedItem;
    setDraggedItem(null);
    if (!item) return;
    const existing = rows.find((r) => r.id === rowId)?.cells.find((c) => c.columnId === columnId);
    addComponentToCell(rowId, columnId, existing, item.create());
  }

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

  // VS-070 (docs/engines/form.md "Contenido fijo revelado en celdas casilla
  // + duplicar columna + hints"): clonar una celda regenerando los ids de
  // opciones — sin esto, dos celdas de columnas distintas compartirían ids
  // de opción y el Runtime colisionaría en las claves de respuesta (el valor
  // guardado es el `id` de la opción). `colSpan` NO se copia: es relativo a
  // la posición de la columna en la fila, un span copiado rompería la grilla.
  function cloneCellForDuplicate(cell: TableConfigCell | undefined, newColumnId: string): TableConfigCell {
    if (!cell) return { columnId: newColumnId, cellType: "texto", editable: true };
    const clone: TableConfigCell = { ...cell, columnId: newColumnId, colSpan: undefined };
    if (cell.options) clone.options = cell.options.map((o) => ({ id: crypto.randomUUID(), label: o.label }));
    if (cell.extraFields) {
      clone.extraFields = cell.extraFields.map((f) =>
        f.type === "seleccion_desplegable"
          ? { ...f, options: f.options.map((o) => ({ id: crypto.randomUUID(), label: o.label })) }
          : { ...f },
      );
    }
    return clone;
  }

  // VS-070: duplicar la columna INMEDIATAMENTE a la derecha de la original,
  // clonando la configuración COMPLETA de cada celda en cada fila — caso
  // real (MAT_MaterialIssues_Selection): 3 columnas "Material N" idénticas
  // celda por celda; sin esto el admin configuraría la misma celda compleja
  // (referencias + extraFields + content + options) N veces a mano.
  function duplicateColumn(columnId: string) {
    const anchorIdx = columns.findIndex((c) => c.id === columnId);
    if (anchorIdx === -1) return;
    const newColumn = { id: crypto.randomUUID() };
    onChange({
      columns: [...columns.slice(0, anchorIdx + 1), newColumn, ...columns.slice(anchorIdx + 1)],
      rows: rows.map((r) => {
        const anchorIdxInRow = r.cells.findIndex((c) => c.columnId === columnId);
        const clone = cloneCellForDuplicate(anchorIdxInRow >= 0 ? r.cells[anchorIdxInRow] : undefined, newColumn.id);
        const cells = [...r.cells];
        if (anchorIdxInRow >= 0) cells.splice(anchorIdxInRow + 1, 0, clone);
        else cells.push(clone);
        return { ...r, cells };
      }),
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

  // VS-066 (docs/engines/form.md "Combinar columnas (colspan)"): réplica
  // fiel de tablas reales con encabezados/celdas que abarcan varias
  // columnas. Al combinar, las columnas cubiertas pierden su propia celda EN
  // ESTA FILA (si tenían una) — evita datos huérfanos que nunca se
  // renderizarían. Clampeado a las columnas que realmente existen a la
  // derecha de esta celda.
  function updateCellColSpan(rowId: string, columnId: string, colSpan: number | undefined) {
    const anchorIdx = columns.findIndex((c) => c.id === columnId);
    const span = colSpan && colSpan > 1 && anchorIdx !== -1 ? Math.min(colSpan, columns.length - anchorIdx) : undefined;
    const coveredIds = new Set(span ? columns.slice(anchorIdx + 1, anchorIdx + span).map((c) => c.id) : []);
    onChange({
      columns,
      rows: rows.map((r) =>
        r.id === rowId
          ? { ...r, cells: r.cells.filter((c) => !coveredIds.has(c.columnId)).map((c) => (c.columnId === columnId ? { ...c, colSpan: span } : c)) }
          : r,
      ),
    });
  }

  // VS-076: CRUD de las opciones de un componente "seleccion_desplegable" —
  // mismo patrón que el CRUD de opciones legacy (VS-016/022), ahora
  // parametrizado por `componentId` en vez de operar sobre la celda entera.
  function addComponentOption(rowId: string, columnId: string, cell: TableConfigCell, componentId: string, currentOptions: { id: string; label: string }[]) {
    updateComponentInCell(rowId, columnId, cell, componentId, { options: [...currentOptions, { id: crypto.randomUUID(), label: "" }] });
  }

  function updateComponentOption(
    rowId: string,
    columnId: string,
    cell: TableConfigCell,
    componentId: string,
    optionId: string,
    label: string,
    currentOptions: { id: string; label: string }[],
  ) {
    updateComponentInCell(rowId, columnId, cell, componentId, { options: currentOptions.map((o) => (o.id === optionId ? { ...o, label } : o)) });
  }

  function removeComponentOption(rowId: string, columnId: string, cell: TableConfigCell, componentId: string, optionId: string, currentOptions: { id: string; label: string }[]) {
    if (currentOptions.length <= 1) return;
    updateComponentInCell(rowId, columnId, cell, componentId, { options: currentOptions.filter((o) => o.id !== optionId) });
  }

  // VS-076: campos de configuración de UN componente — reemplaza el switch
  // gigante por `cellType` de la Fase 1 (VS-071), ahora mucho más chico
  // porque cada componente ya no necesita cargar con las ramas de los
  // demás (gating de casilla, referencias/extraFields "compañeros",
  // editable/contenido fijo — todo eso ahora son componentes hermanos
  // independientes, no secciones condicionales dentro de un mismo switch).
  function renderComponentFields(
    row: TableConfigRows[number],
    col: TableConfigColumns[number],
    cell: TableConfigCell,
    component: TableCellComponent,
    siblings: TableCellComponent[],
  ) {
    const patch = (p: Record<string, unknown>) => updateComponentInCell(row.id, col.id, cell, component.id, p);
    switch (component.type) {
      case "texto_fijo":
        return (
          <label className="field">
            <span className="field__label">Contenido</span>
            <RichTextEditor value={component.content ?? ""} onChange={(html) => patch({ content: html })} ariaLabel="Contenido del texto fijo" />
          </label>
        );
      case "texto_corto":
        return (
          <>
            <label className="field">
              <span className="field__label">Etiqueta (opcional)</span>
              <input value={component.label ?? ""} onChange={(e) => patch({ label: e.target.value === "" ? undefined : e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">Longitud máxima</span>
              <input
                type="number"
                value={component.maxLength ?? ""}
                onChange={(e) => patch({ maxLength: e.target.value === "" ? undefined : Number(e.target.value) })}
              />
            </label>
          </>
        );
      case "numero":
        return (
          <div className="field-grid">
            <label className="field">
              <span className="field__label">Etiqueta (opcional)</span>
              <input value={component.label ?? ""} onChange={(e) => patch({ label: e.target.value === "" ? undefined : e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">Unidad</span>
              <input
                value={component.unit ?? ""}
                placeholder="ej. met. ton. CO2e, %"
                onChange={(e) => patch({ unit: e.target.value === "" ? undefined : e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field__label">Unidades separadas por comas</span>
              <input
                key={`${component.id}-units`}
                defaultValue={component.availableUnits?.join(", ") ?? ""}
                placeholder="ej. MWh, GJ, kWh"
                onBlur={(e) =>
                  patch({
                    availableUnits:
                      e.target.value.trim() === "" ? undefined : e.target.value.split(",").map((s) => s.trim()).filter((s) => s.length > 0),
                  })
                }
              />
            </label>
          </div>
        );
      case "seleccion_desplegable":
        return (
          <div className="sub-options">
            {component.options.map((opt) => (
              <div className="option-row option-row--sub" key={opt.id}>
                <div className="option-row__editor">
                  <RichTextEditor
                    value={opt.label}
                    onChange={(html) => updateComponentOption(row.id, col.id, cell, component.id, opt.id, html, component.options)}
                    ariaLabel="Opción"
                  />
                </div>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => removeComponentOption(row.id, col.id, cell, component.id, opt.id, component.options)}
                  disabled={component.options.length <= 1}
                >
                  Quitar
                </Button>
              </div>
            ))}
            <Button type="button" size="sm" onClick={() => addComponentOption(row.id, col.id, cell, component.id, component.options)}>
              Agregar opción
            </Button>
          </div>
        );
      case "casilla": {
        // VS-076: reemplaza el gating implícito legacy ("extraFields de una
        // casilla siempre se revelan al marcar") por una relación explícita
        // — el admin elige QUÉ componentes hermanos revela esta casilla.
        const otherComponents = siblings.filter((c) => c.id !== component.id);
        return (
          <>
            <label className="field">
              <span className="field__label">Etiqueta de la casilla</span>
              <RichTextEditor value={component.checkboxLabel ?? ""} onChange={(html) => patch({ checkboxLabel: html })} ariaLabel="Etiqueta de la casilla" />
            </label>
            {otherComponents.length > 0 && (
              <div className="sub-options">
                <span className="field__label">Revela estos elementos al marcarse:</span>
                {otherComponents.map((sibling) => {
                  const siblingPreview = componentPreviewText(sibling);
                  return (
                    <label className="field field--checkbox" key={sibling.id}>
                      <input
                        type="checkbox"
                        checked={(component.gates ?? []).includes(sibling.id)}
                        onChange={() => toggleComponentGate(row.id, col.id, cell, component.id, sibling.id)}
                      />
                      <span className="field__label">
                        {COMPONENT_TYPE_LABEL[sibling.type]}
                        {siblingPreview ? ` — ${siblingPreview}` : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </>
        );
      }
      case "referencia":
        return (
          <div className="field-grid">
            <label className="field">
              <span className="field__label">Máximo de referencias</span>
              <input
                type="number"
                min={1}
                value={component.references?.maxUrls ?? ""}
                placeholder="3"
                onChange={(e) =>
                  patch({ references: { ...component.references, maxUrls: e.target.value === "" ? undefined : Number(e.target.value) } })
                }
              />
            </label>
            <label className="field">
              <span className="field__label">Tipo de referencia</span>
              <select
                value={component.references?.refType ?? "public"}
                onChange={(e) => patch({ references: { ...component.references, refType: e.target.value === "flexible" ? "flexible" : undefined } })}
              >
                <option value="public">URL pública</option>
                <option value="flexible">Flexible (URL o documento interno)</option>
              </select>
            </label>
          </div>
        );
      case "calculado":
        return (
          <label className="field">
            <span className="field__label">Fórmula (referencia otras filas de esta columna con {"{"}filaId{"}"})</span>
            <input value={component.expression} placeholder="ej. {r1}+{r2}+{r3}" onChange={(e) => patch({ expression: e.target.value })} />
            {formulaError(component.expression) && (
              <p className="alert" role="alert">
                {formulaError(component.expression)}
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
                    onClick={() => patch({ expression: `${component.expression}{${r.id}}` })}
                  >
                    Fila {i + 1}
                  </button>
                ))}
            </div>
          </label>
        );
    }
  }

  // VS-073: selección válida para "Combinar" (≥2 columnas de la misma fila)
  // o para "Separar" (1 columna cuya celda ya está combinada) — resuelto acá
  // para no repetir el lookup en la barra contextual y en el render.
  const combinableSelection = selection && selection.columnIds.length > 1 ? selection : null;
  const separableCell =
    selection && selection.columnIds.length === 1
      ? rows.find((r) => r.id === selection.rowId)?.cells.find((c) => c.columnId === selection.columnIds[0])
      : undefined;
  const canSeparate = Boolean(separableCell?.colSpan && separableCell.colSpan >= 2);

  return (
    <div className="table-config-builder">
      {/* VS-071 (docs/engines/form.md "Panel lateral drag & drop para tipo
          de celda"): panel persistente, siempre visible mientras se edita
          la tabla — el flujo principal es arrastrar una tarjeta a una
          celda, no abrir un <select>. */}
      <div className="table-config-palette" role="list" aria-label="Elementos disponibles para arrastrar a una celda">
        <p className="table-config-palette__heading">Elementos</p>
        {CELL_PALETTE_ITEMS.map((item) => (
          <div
            key={item.key}
            role="listitem"
            className="table-config-palette__card"
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.effectAllowed = "copy";
              setDraggedItem(item);
            }}
            onDragEnd={() => {
              setDraggedItem(null);
              setDragOverCellKey(null);
            }}
          >
            {item.label}
          </div>
        ))}
      </div>
      <div className="table-config-grid-wrap">
        {combinableSelection && (
          <div className="table-config-merge-bar">
            <span>{combinableSelection.columnIds.length} celdas seleccionadas</span>
            <Button type="button" size="sm" onClick={combineSelection}>
              Combinar celdas
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={clearSelection}>
              Cancelar
            </Button>
          </div>
        )}
        {!combinableSelection && canSeparate && (
          <div className="table-config-merge-bar">
            <span>Celda combinada ({separableCell!.colSpan} columnas)</span>
            <Button type="button" size="sm" onClick={separateSelection}>
              Separar celdas
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={clearSelection}>
              Cancelar
            </Button>
          </div>
        )}
      <table className="table-config-grid">
        <tbody>
          {rows.map((row, rowIdx) => {
            // VS-066 (docs/engines/form.md "Combinar columnas (colspan)"):
            // columnas cubiertas por el colSpan de una celda anterior EN
            // ESTA FILA no se renderizan como celda propia — mismo criterio
            // que "grillas irregulares" (VS-048), precomputado por fila para
            // no mutar un contador durante el .map() de columnas.
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
                const cell = row.cells.find((c) => c.columnId === col.id);
                const cellKey = `${row.id}:${col.id}`;
                if (!cell) {
                  return (
                    <td
                      key={col.id}
                      className={
                        "table-config-grid__blank" + (dragOverCellKey === cellKey ? " table-config-grid__cell--drop-active" : "")
                      }
                      onMouseDown={(e) => handleCellMouseDown(e, row.id, col.id)}
                      onMouseEnter={() => handleCellMouseEnter(row.id, col.id)}
                      onDragOver={(e) => {
                        if (!draggedItem) return;
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDragEnter={(e) => {
                        if (!draggedItem) return;
                        e.stopPropagation();
                        setDragOverCellKey(cellKey);
                      }}
                      onDragLeave={(e) => {
                        e.stopPropagation();
                        setDragOverCellKey((k) => (k === cellKey ? null : k));
                      }}
                      onDrop={(e) => handleCellDrop(e, row.id, col.id)}
                    >
                      <button type="button" className="table-config-grid__add-cell" onClick={() => addCell(row.id, col.id)} title="Agregar celda aquí">
                        +
                      </button>
                    </td>
                  );
                }
                const components = normalizeCellComponents(cell);
                const isSelected = Boolean(selection && selection.rowId === row.id && selection.columnIds.includes(col.id));
                const cellClasses = [
                  "table-config-grid__cell",
                  dragOverCellKey === cellKey && "table-config-grid__cell--drop-active",
                  isSelected && selection!.columnIds.length > 1 && "table-config-grid__cell--selected",
                ]
                  .filter(Boolean)
                  .join(" ");
                // VS-076: el footer de acciones de fila/columna aparece una
                // sola vez por celda, cuando CUALQUIERA de sus componentes
                // está expandido — evita repetirlo N veces (uno por
                // componente) o esconderlo por completo.
                const anyComponentExpanded = expandedComponent?.startsWith(`${row.id}:${col.id}:`) ?? false;
                return (
                  <td
                    key={col.id}
                    className={cellClasses}
                    colSpan={cell.colSpan}
                    onMouseDown={(e) => handleCellMouseDown(e, row.id, col.id)}
                    onMouseEnter={() => handleCellMouseEnter(row.id, col.id)}
                    onDragOver={(e) => {
                      if (!draggedItem) return;
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDragEnter={(e) => {
                      if (!draggedItem) return;
                      e.stopPropagation();
                      setDragOverCellKey(cellKey);
                    }}
                    onDragLeave={(e) => {
                      e.stopPropagation();
                      setDragOverCellKey((k) => (k === cellKey ? null : k));
                    }}
                    onDrop={(e) => handleCellDrop(e, row.id, col.id)}
                  >
                    <div className="table-config-cell-components">
                      {components.map((component) => {
                        const componentKey = `${row.id}:${col.id}:${component.id}`;
                        const preview = componentPreviewText(component);
                        return (
                          <div
                            key={component.id}
                            className="table-config-cell-component"
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              e.dataTransfer.effectAllowed = "move";
                              draggedComponentRef.current = { rowId: row.id, columnId: col.id, componentId: component.id };
                            }}
                            onDragEnd={() => {
                              draggedComponentRef.current = null;
                            }}
                            onDragOver={(e) => {
                              const dragged = draggedComponentRef.current;
                              if (!dragged || dragged.rowId !== row.id || dragged.columnId !== col.id || dragged.componentId === component.id) return;
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onDrop={(e) => {
                              const dragged = draggedComponentRef.current;
                              if (!dragged || dragged.rowId !== row.id || dragged.columnId !== col.id || dragged.componentId === component.id) return;
                              e.preventDefault();
                              e.stopPropagation();
                              reorderComponentInCell(row.id, col.id, cell, dragged.componentId, component.id);
                              draggedComponentRef.current = null;
                            }}
                          >
                            <button
                              type="button"
                              className="table-config-grid__chip"
                              onClick={() => setExpandedComponent(expandedComponent === componentKey ? null : componentKey)}
                              title={preview}
                            >
                              <span className="table-config-grid__chip-type">{COMPONENT_TYPE_LABEL[component.type]}</span>
                              {preview && <span className="table-config-grid__chip-preview">{preview}</span>}
                            </button>
                            <button
                              type="button"
                              className="table-config-grid__remove-cell"
                              onClick={() => removeComponentFromCell(row.id, col.id, cell, component.id)}
                              title="Quitar componente"
                              aria-label="Quitar componente"
                            >
                              ×
                            </button>
                            {expandedComponent === componentKey && (
                              <div className="table-config-grid__cell-config">
                                {renderComponentFields(row, col, cell, component, components)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {anyComponentExpanded && (
                      <div className="table-config-grid__cell-footer">
                        <Button type="button" variant="danger" size="sm" onClick={() => removeRow(row.id)} disabled={rows.length <= 1}>
                          Quitar fila
                        </Button>
                        <Button type="button" size="sm" onClick={() => duplicateColumn(col.id)} title="Duplicar esta columna a la derecha">
                          Duplicar columna
                        </Button>
                        <Button type="button" variant="danger" size="sm" onClick={() => removeColumn(col.id)} disabled={columns.length <= 1}>
                          Quitar columna
                        </Button>
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
            );
          })}
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

  // Campo embebido directo en una opción de nivel superior (VS-062,
  // docs/engines/form.md "Campo embebido directo en una opción de nivel
  // superior"): mismo tipo `SubOptionField` que VS-040 (subOption.field), un
  // nivel menos de anidación — la opción misma, no una sub-opción. Mismo
  // patrón de funciones que addSubOptionField/removeSubOptionField/etc, sin
  // el parámetro `subOptionId`/`block`.
  type FormOption = Extract<FormElement, { type: "seleccion_unica" }>["options"][number];

  function updateOptionNode(elementId: string, optionId: string, updater: (opt: FormOption) => FormOption) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return { ...el, options: el.options.map((opt) => (opt.id === optionId ? updater(opt) : opt)) };
      }),
    );
  }

  function addOptionField(elementId: string, optionId: string, type: SubOptionField["type"]) {
    const field: SubOptionField =
      type === "seleccion_desplegable"
        ? { type: "seleccion_desplegable", options: [{ id: crypto.randomUUID(), label: "" }] }
        : type === "texto_corto"
          ? { type: "texto_corto" }
          : { type: "numero" };
    updateOptionNode(elementId, optionId, (opt) => ({ ...opt, field }));
  }

  function removeOptionField(elementId: string, optionId: string) {
    updateOptionNode(elementId, optionId, (opt) => {
      const { field: _field, ...rest } = opt;
      return rest;
    });
  }

  function updateOptionFieldMaxLength(elementId: string, optionId: string, maxLength: number | undefined) {
    updateOptionNode(elementId, optionId, (opt) => (opt.field?.type === "texto_corto" ? { ...opt, field: { ...opt.field, maxLength } } : opt));
  }

  function updateOptionFieldNumero(
    elementId: string,
    optionId: string,
    patch: { min?: number | undefined; max?: number | undefined; unit?: string | undefined },
  ) {
    updateOptionNode(elementId, optionId, (opt) => (opt.field?.type === "numero" ? { ...opt, field: { ...opt.field, ...patch } } : opt));
  }

  function addOptionFieldOption(elementId: string, optionId: string) {
    updateOptionNode(elementId, optionId, (opt) =>
      opt.field?.type === "seleccion_desplegable"
        ? { ...opt, field: { ...opt.field, options: [...opt.field.options, { id: crypto.randomUUID(), label: "" }] } }
        : opt,
    );
  }

  function updateOptionFieldOption(elementId: string, optionId: string, fieldOptionId: string, label: string) {
    updateOptionNode(elementId, optionId, (opt) =>
      opt.field?.type === "seleccion_desplegable"
        ? { ...opt, field: { ...opt.field, options: opt.field.options.map((o) => (o.id === fieldOptionId ? { ...o, label } : o)) } }
        : opt,
    );
  }

  function removeOptionFieldOption(elementId: string, optionId: string, fieldOptionId: string) {
    updateOptionNode(elementId, optionId, (opt) =>
      opt.field?.type === "seleccion_desplegable" && opt.field.options.length > 1
        ? { ...opt, field: { ...opt.field, options: opt.field.options.filter((o) => o.id !== fieldOptionId) } }
        : opt,
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

  // VS-068 (docs/engines/form.md "Exclusividad y encabezado del bloque
  // primario de sub-opciones"): encabezado del bloque PRIMARIO, mismo campo
  // que updateSecondaryOptionsHeading pero para `subOptions` — antes solo el
  // bloque secundario podía tener encabezado propio.
  function updateSubOptionsHeading(elementId: string, optionId: string, heading: string) {
    commit(
      elements.map((el) => {
        if (el.id !== elementId) return el;
        if (el.type !== "seleccion_unica" && el.type !== "seleccion_multiple") return el;
        return { ...el, options: el.options.map((opt) => (opt.id === optionId ? { ...opt, subOptionsHeading: heading } : opt)) };
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

  // VS-068 (docs/engines/form.md "Exclusividad y encabezado del bloque
  // primario de sub-opciones"): exclusividad de las subOptions PROPIAS de
  // esta sub-opción (nivel 2, subSubOption[]) — antes hardcodeado a
  // checkbox en Runtime/Preview, sin forma de marcarlo como radio desde el
  // Builder. No confundir con toggleSubOptionsExclusive (nivel 1, sobre
  // formOption) ni toggleSecondaryOptionsExclusive (bloque secundario).
  function toggleSubOptionOwnExclusive(
    elementId: string,
    optionId: string,
    subOptionId: string,
    exclusive: boolean,
    block: OptionSubBlock = "subOptions",
  ) {
    updateSubOptionNode(elementId, optionId, subOptionId, (sub) => ({ ...sub, subOptionsExclusive: exclusive }), block);
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
                                  <>
                                    {/* VS-068 (docs/engines/form.md "Exclusividad y
                                        encabezado del bloque primario de
                                        sub-opciones"): encabezado propio del
                                        bloque PRIMARIO — mismo campo que el
                                        bloque secundario (VS-046), antes solo
                                        ese tenía dónde guardarlo. */}
                                    <label className="field">
                                      <span className="field__label">Encabezado del bloque de sub-opciones (opcional)</span>
                                      <RichTextEditor
                                        value={opt.subOptionsHeading ?? ""}
                                        onChange={(html) => updateSubOptionsHeading(el.id, opt.id, html)}
                                        ariaLabel="Encabezado del bloque de sub-opciones"
                                      />
                                    </label>
                                    <label className="field field--checkbox">
                                      <input
                                        type="checkbox"
                                        checked={opt.subOptionsExclusive ?? false}
                                        onChange={(e) => toggleSubOptionsExclusive(el.id, opt.id, e.target.checked)}
                                      />
                                      <span className="field__label">Sub-opciones excluyentes (solo una a la vez)</span>
                                    </label>
                                  </>
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
                                      {/* VS-068: exclusividad de las
                                          sub-sub-opciones de ESTA sub-opción —
                                          antes hardcodeado a checkbox. */}
                                      {(sub.subOptions?.length ?? 0) > 0 && (
                                        <label className="field field--checkbox">
                                          <input
                                            type="checkbox"
                                            checked={sub.subOptionsExclusive ?? false}
                                            onChange={(e) => toggleSubOptionOwnExclusive(el.id, opt.id, sub.id, e.target.checked)}
                                          />
                                          <span className="field__label">Sub-sub-opciones excluyentes (solo una a la vez)</span>
                                        </label>
                                      )}
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
                                        {/* VS-068 (docs/engines/form.md
                                            "Exclusividad y encabezado del
                                            bloque primario de sub-opciones"):
                                            el bloque secundario nunca tuvo UI
                                            de sub-sub-opciones — mismo bloque
                                            que el primario, con block=
                                            "secondaryOptions" en cada CRUD. */}
                                        <div className="sub-options" style={{ marginLeft: "var(--space-4)" }}>
                                          {(sub.subOptions?.length ?? 0) > 0 && (
                                            <label className="field field--checkbox">
                                              <input
                                                type="checkbox"
                                                checked={sub.subOptionsExclusive ?? false}
                                                onChange={(e) =>
                                                  toggleSubOptionOwnExclusive(el.id, opt.id, sub.id, e.target.checked, "secondaryOptions")
                                                }
                                              />
                                              <span className="field__label">Sub-sub-opciones excluyentes (solo una a la vez)</span>
                                            </label>
                                          )}
                                          {(sub.subOptions ?? []).map((subsub) => (
                                            <div className="option-row option-row--subsub" key={subsub.id}>
                                              <div className="option-row__editor">
                                                <RichTextEditor
                                                  value={subsub.label}
                                                  onChange={(html) =>
                                                    updateSubSubOption(el.id, opt.id, sub.id, subsub.id, html, "secondaryOptions")
                                                  }
                                                  ariaLabel="Texto de la sub-sub-opción"
                                                />
                                              </div>
                                              <Button
                                                type="button"
                                                variant="danger"
                                                size="sm"
                                                onClick={() => removeSubSubOption(el.id, opt.id, sub.id, subsub.id, "secondaryOptions")}
                                              >
                                                Quitar
                                              </Button>
                                            </div>
                                          ))}
                                          <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => addSubSubOption(el.id, opt.id, sub.id, "secondaryOptions")}
                                          >
                                            Agregar sub-sub-opción
                                          </Button>
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
                              {/* VS-062 (docs/engines/form.md "Campo embebido
                                  directo en una opción de nivel superior"):
                                  mismo patrón que sub.field (VS-040), antes de
                                  la tabla — mismo orden visual que el HTML de
                                  S&P (COG_DisclosureMedian_Selection). */}
                              <div className="sub-option-field" style={{ marginTop: "var(--space-2)" }}>
                                {opt.field ? (
                                  <div className="option-row">
                                    <span className="field__label">
                                      {opt.field.type === "seleccion_desplegable" && "Campo: selección desplegable"}
                                      {opt.field.type === "texto_corto" && "Campo: texto corto"}
                                      {opt.field.type === "numero" && "Campo: número"}
                                    </span>
                                    <Button type="button" variant="danger" size="sm" onClick={() => removeOptionField(el.id, opt.id)}>
                                      Quitar campo
                                    </Button>
                                  </div>
                                ) : (
                                  <select
                                    value=""
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        addOptionField(el.id, opt.id, e.target.value as SubOptionField["type"]);
                                      }
                                    }}
                                  >
                                    <option value="">Agregar campo…</option>
                                    <option value="seleccion_desplegable">Selección desplegable</option>
                                    <option value="texto_corto">Texto corto</option>
                                    <option value="numero">Número</option>
                                  </select>
                                )}
                                {opt.field?.type === "seleccion_desplegable" &&
                                  (() => {
                                    const selectField = opt.field;
                                    return (
                                      <div className="options" style={{ marginLeft: "var(--space-4)" }}>
                                        {selectField.options.map((fo) => (
                                          <div className="option-row" key={fo.id}>
                                            <div className="option-row__editor">
                                              <RichTextEditor
                                                value={fo.label}
                                                onChange={(html) => updateOptionFieldOption(el.id, opt.id, fo.id, html)}
                                                ariaLabel="Texto de la opción del campo"
                                              />
                                            </div>
                                            <Button
                                              type="button"
                                              variant="danger"
                                              size="sm"
                                              onClick={() => removeOptionFieldOption(el.id, opt.id, fo.id)}
                                              disabled={selectField.options.length <= 1}
                                            >
                                              Quitar
                                            </Button>
                                          </div>
                                        ))}
                                        <Button type="button" size="sm" onClick={() => addOptionFieldOption(el.id, opt.id)}>
                                          Agregar opción
                                        </Button>
                                      </div>
                                    );
                                  })()}
                                {opt.field?.type === "texto_corto" && (
                                  <label className="field" style={{ marginLeft: "var(--space-4)" }}>
                                    <span className="field__label">Longitud máxima</span>
                                    <input
                                      type="number"
                                      value={opt.field.maxLength ?? ""}
                                      onChange={(e) =>
                                        updateOptionFieldMaxLength(el.id, opt.id, e.target.value === "" ? undefined : Number(e.target.value))
                                      }
                                    />
                                  </label>
                                )}
                                {opt.field?.type === "numero" && (
                                  <div className="field-grid" style={{ marginLeft: "var(--space-4)" }}>
                                    <label className="field">
                                      <span className="field__label">Mínimo</span>
                                      <input
                                        type="number"
                                        value={opt.field.min ?? ""}
                                        onChange={(e) =>
                                          updateOptionFieldNumero(el.id, opt.id, { min: e.target.value === "" ? undefined : Number(e.target.value) })
                                        }
                                      />
                                    </label>
                                    <label className="field">
                                      <span className="field__label">Máximo</span>
                                      <input
                                        type="number"
                                        value={opt.field.max ?? ""}
                                        onChange={(e) =>
                                          updateOptionFieldNumero(el.id, opt.id, { max: e.target.value === "" ? undefined : Number(e.target.value) })
                                        }
                                      />
                                    </label>
                                    <label className="field">
                                      <span className="field__label">Unidad</span>
                                      <input
                                        value={opt.field.unit ?? ""}
                                        onChange={(e) =>
                                          updateOptionFieldNumero(el.id, opt.id, { unit: e.target.value === "" ? undefined : e.target.value })
                                        }
                                      />
                                    </label>
                                  </div>
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