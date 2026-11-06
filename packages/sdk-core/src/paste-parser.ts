import { componentRegistry } from "./component-registry.js";
import type { FormElement } from "./form-schema.js";

// Intérprete de texto pegado (Word/Excel/PDF/Typeform/cuestionarios CSA) →
// Elementos del formulario. Función pura y determinista: el Builder muestra el
// resultado como borrador y el usuario solo corrige los casos dudosos.
// Ver docs/engines/form.md "Importar desde texto pegado".

export type PasteConfidence = "alta" | "media" | "baja";

export interface ParsedItem {
  element: FormElement;
  confidence: PasteConfidence;
  /** Por qué se eligió ese tipo (se muestra al usuario en lenguaje llano). */
  reason: string;
}

type ElementType = FormElement["type"];

const uid = () => globalThis.crypto.randomUUID();
const version = (t: ElementType) => componentRegistry.find((c) => c.type === t)?.version ?? 1;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- Clasificación de líneas ----------
type Marker = "radio" | "check" | "bullet" | "letter" | null;

const RADIO = /^\s*(?:[○◯●◉⚪⚫]|\(\s?[xX•]?\s?\))\s*/;
const CHECK = /^\s*(?:[☐☑☒□■▢✓✔]|\[\s?[xX✓]?\s?\])\s*/;
const BULLET = /^\s*(?:[-–—•·▪*])\s+/;
const LETTER = /^\s*(?:[a-hA-H]|[ivxIVX]{1,3}|\d{1,2})[).]\s+/;

function optionMarker(line: string): { marker: Marker; text: string } {
  let m = line.match(RADIO);
  if (m) return { marker: "radio", text: line.slice(m[0].length).trim() };
  m = line.match(CHECK);
  if (m) return { marker: "check", text: line.slice(m[0].length).trim() };
  m = line.match(BULLET);
  if (m) return { marker: "bullet", text: line.slice(m[0].length).trim() };
  return { marker: null, text: line.trim() };
}

const indentOf = (line: string) => (line.match(/^[ \t]*/)![0].replace(/\t/g, "    ")).length;
const BLANK_FILL = /_{3,}|\.{5,}|…{2,}/;
const NUM_PREFIX = /^\s*(?:P(?:regunta)?\s*)?\d+(?:\.\d+)*[.)]?\s+(?=\S)/i;
const NUMBERED_QUESTION = /^\s*(?:P(?:regunta)?\s*)?\d+(?:\.\d+)*[.)]\s+\S/i;
const UNITS = /\b(kwh|mwh|gwh|gj|tj|m3|m³|m2|m²|kg|ton(?:eladas)?|tco2e?|co2e?|tco₂e?|litros?|l|usd|pen|s\/|%|soles|us\$|horas|h|días|dias|años|anos|personas|empleados|km|mw|kw|gal(?:ones)?)\b/i;

function stripNumbering(s: string) {
  return s.replace(NUM_PREFIX, "").trim();
}

// ---------- Tablas ----------
function splitCells(line: string): string[] {
  let cells: string[];
  if (line.includes("|")) cells = line.trim().replace(/^\||\|$/g, "").split("|");
  else cells = line.split("\t");
  return cells.map((c) => c.trim());
}
const isTableLine = (line: string) =>
  (line.includes("|") && splitCells(line).length >= 2 && !/^\s*[-:| ]+$/.test(line) ) ||
  (line.includes("\t") && splitCells(line).filter(Boolean).length >= 2);
const isTableSeparator = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes("-");

function buildTable(label: string, rows: string[][]): ParsedItem {
  const width = Math.max(...rows.map((r) => r.length));
  const columns = Array.from({ length: width }, () => ({ id: uid() }));
  const headerRow = {
    id: uid(),
    cells: columns.map((c, i) => ({ columnId: c.id, cellType: "texto" as const, editable: false, content: esc(rows[0]![i] ?? "") })),
  };
  const body = rows.slice(1);
  const dataRows = (body.length ? body : [[]]).map((r) => ({
    id: uid(),
    cells: columns.map((c, i) => {
      const txt = r[i] ?? "";
      // Primera columna con texto = nombre de la fila (solo lectura); el resto se captura.
      if (i === 0 && txt) return { columnId: c.id, cellType: "texto" as const, editable: false, content: esc(txt) };
      return { columnId: c.id, cellType: "texto" as const, editable: true };
    }),
  }));
  return {
    element: { id: uid(), type: "tabla_datos", label: esc(label), columns, rows: [headerRow, ...dataRows], componentVersion: version("tabla_datos") } as FormElement,
    confidence: "alta",
    reason: `Detecté una tabla de ${width} columnas`,
  };
}

// ---------- Tipo por palabras clave (sin opciones) ----------
function inferFromLabel(label: string, rawLine: string): { type: ElementType; unit?: string | undefined; confidence: PasteConfidence; reason: string } {
  const l = label.toLowerCase();
  if (/https?:\/\/|\burl\b|enlace|\blink\b|sitio web|página web|pagina web/.test(l))
    return { type: "url_publica", confidence: "alta", reason: "Menciona un enlace / URL" };
  if (/evidenc|adjunt|sube |cargue|documento de respaldo|archivo|sustento documental|anexo/.test(l))
    return { type: "evidencia", confidence: "alta", reason: "Pide evidencia o adjuntos" };
  if (/\bfecha\b|dd\/mm|aaaa|\bdate\b/.test(l))
    return { type: "fecha", confidence: "alta", reason: "Pide una fecha" };
  const blank = BLANK_FILL.test(rawLine);
  const unit = rawLine.match(UNITS)?.[0];
  if (blank && unit) return { type: "numero", unit, confidence: "alta", reason: `Casilla con unidad (${unit})` };
  if (/cuánt|cuant|cantidad|número de|numero de|total de|porcentaje|% de|consumo|emisiones|monto|importe|n\.º|nº/.test(l))
    return { type: "numero", unit, confidence: "media", reason: "Parece pedir una cifra" };
  if (blank && !unit) return { type: "texto_corto", confidence: "media", reason: "Espacio en blanco para completar" };
  if (/describ|explique|detall|justifi|comente|indique cómo|indique como|sustent|argument|cuál es el proceso|cómo /.test(l))
    return { type: "texto_largo", confidence: "media", reason: "Pide una explicación" };
  if (/^¿?(tiene|cuenta con|existe|posee|han?|dispone|realiza|se |es |está|esta |la empresa|el grupo)/i.test(label) && label.includes("?"))
    return { type: "seleccion_unica", confidence: "media", reason: "Pregunta de sí/no" };
  return { type: "texto_corto", confidence: "baja", reason: "No hay pistas claras: la dejé como texto corto" };
}

const BANNER_START = /^\s*(aviso|nota|importante|requisito|atención|atencion|recuerde|advertencia|información adicional|informacion adicional)\b\s*[:.\-–]?\s*/i;
const MULTI_HINT = /seleccione (?:todas|todos|las que|los que)|marque (?:todas|todos|las que|los que)|una o más|una o mas|varias opciones|puede(?:n)? (?:elegir|seleccionar) (?:más|mas|varias)|todas las que apliquen|select all/i;
const YES_NO_INLINE = /[(\[]?\s*(s[ií])\s*[\/|,]\s*(no)\s*[)\]]?\s*[?.]?\s*$/i;

function makeOptions(items: { text: string; subs: string[] }[]) {
  return items.map((o) => ({
    id: uid(),
    label: esc(o.text),
    ...(o.subs.length ? { subOptions: o.subs.map((s) => ({ id: uid(), label: esc(s) })) } : {}),
  }));
}

// ---------- Parser principal ----------
export function parsePastedText(input: string): ParsedItem[] {
  const lines = input
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .split("\n");
  const out: ParsedItem[] = [];

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i]!;
    if (raw.trim() === "") { i++; continue; }

    // Encabezado markdown / todo en mayúsculas → texto informativo
    const md = raw.match(/^\s*#{1,6}\s+(.*)$/);
    if (md) {
      out.push({ element: { id: uid(), type: "instruccion", label: esc(md[1]!.trim()), componentVersion: version("instruccion") }, confidence: "media", reason: "Encabezado → texto informativo" });
      i++; continue;
    }

    // Tabla: ≥2 líneas consecutivas con celdas
    if (isTableLine(raw)) {
      const rows: string[][] = [];
      let j = i;
      while (j < lines.length && lines[j]!.trim() !== "" && (isTableLine(lines[j]!) || isTableSeparator(lines[j]!))) {
        if (!isTableSeparator(lines[j]!)) rows.push(splitCells(lines[j]!));
        j++;
      }
      if (rows.length >= 1 && (rows.length >= 2 || rows[0]!.length >= 3)) {
        // Título de la tabla: la línea anterior si fue un texto suelto ya emitido como pregunta de baja confianza
        let label = "Tabla";
        const prev = out[out.length - 1];
        if (prev && prev.element.type === "texto_corto" && prev.confidence === "baja" && i > 0 && lines[i - 1]!.trim() !== "") {
          label = stripHtml((prev.element as { label: string }).label);
          out.pop();
        }
        out.push(buildTable(label, rows));
        i = j; continue;
      }
    }

    // ¿Es una opción suelta sin pregunta (lista al inicio)? Se agrupa abajo, con la pregunta previa.
    const first = optionMarker(raw);
    const isOptionLine = first.marker !== null || /^\s*[a-hA-H][).]\s+\S/.test(raw);
    if (isOptionLine && out.length > 0) {
      const prev = out[out.length - 1]!;
      if (prev.element.type === "texto_corto" || prev.element.type === "texto_largo" || prev.element.type === "numero") {
        // opciones que siguen a una pregunta ya emitida: reabrir como selección
        const q = prev.element as { label: string; helpText?: string };
        out.pop();
        const { items, next, multi, hasBullet } = readOptions(lines, i);
        out.push(buildChoice(stripHtml(q.label), q.helpText, items, multi, hasBullet, lines[i - 1] ?? ""));
        i = next; continue;
      }
    }
    if (isOptionLine && out.length === 0) {
      const { items, next, multi, hasBullet } = readOptions(lines, i);
      out.push(buildChoice("", undefined, items, multi, hasBullet, ""));
      i = next; continue;
    }

    // Línea de texto: ¿pregunta, banner, casilla de completar?
    let text = raw.trim();
    const numbered = NUMBERED_QUESTION.test(raw);
    const bannerHit = BANNER_START.test(text);

    // Aviso/nota → banner (todo el párrafo hasta línea en blanco)
    if (bannerHit && !text.includes("?")) {
      const para: string[] = [text.replace(BANNER_START, "").trim()];
      let j = i + 1;
      while (j < lines.length && lines[j]!.trim() !== "" && !optionMarker(lines[j]!).marker && !NUMBERED_QUESTION.test(lines[j]!)) { para.push(lines[j]!.trim()); j++; }
      const head = text.match(BANNER_START)![1]!;
      out.push({
        element: { id: uid(), type: "banner", label: esc(head.charAt(0).toUpperCase() + head.slice(1).toLowerCase()), content: esc(para.filter(Boolean).join(" ")), variant: /aviso|importante|atenci|advert/i.test(head) ? "warning" : "info", componentVersion: version("banner") } as FormElement,
        confidence: "alta", reason: `Empieza con “${head}” → aviso`,
      });
      i = j; continue;
    }

    text = stripNumbering(text);

    // Sí/No en la misma línea
    const yn = text.match(YES_NO_INLINE);
    if (yn && text.includes("?")) {
      const label = text.replace(YES_NO_INLINE, "").trim();
      out.push({
        element: { id: uid(), type: "seleccion_unica", label: esc(label), options: makeOptions([{ text: "Sí", subs: [] }, { text: "No", subs: [] }]), componentVersion: version("seleccion_unica") } as FormElement,
        confidence: "alta", reason: "Sí / No en la misma línea",
      });
      i++; continue;
    }

    // Mirar adelante (se tolera UNA línea en blanco entre la pregunta y lo que sigue)
    let j = i + 1;
    let help: string | undefined;
    const peek = () => {
      let k = j;
      if ((lines[k] ?? "").trim() === "" && k + 1 < lines.length) k++;
      return k;
    };
    let fillLine = "";
    let k = peek();
    const fillCand = lines[k] ?? "";
    if (fillCand.trim() !== "" && BLANK_FILL.test(fillCand) && !optionMarker(fillCand).marker && !NUMBERED_QUESTION.test(fillCand)) { fillLine = fillCand; j = k + 1; }
    k = peek();
    const helpCand = lines[k] ?? "";
    if (!fillLine && /^\s*\(.*\)\s*$/.test(helpCand)) { help = helpCand.trim().replace(/^\(|\)$/g, ""); j = k + 1; }

    k = peek();
    const nl = lines[k] ?? "";
    const optNext = nl.trim() !== "" && (optionMarker(nl).marker !== null || LETTER.test(nl)) && !NUMBERED_QUESTION.test(nl);
    if (optNext) {
      const { items, next, multi, hasBullet } = readOptions(lines, k);
      out.push(buildChoice(text, help, items, multi, hasBullet, text + " " + (help ?? "")));
      i = next; continue;
    }

    // Banner por longitud y sin pregunta (párrafo explicativo)
    if (!numbered && !text.includes("?") && !BLANK_FILL.test(raw) && text.length > 160) {
      out.push({ element: { id: uid(), type: "instruccion", label: esc(text), componentVersion: version("instruccion") }, confidence: "media", reason: "Párrafo largo sin pregunta → texto informativo" });
      i = j; continue;
    }

    // Texto suelto → inferir por palabras clave
    const merged = (text + " " + fillLine).trim();
    const inf = inferFromLabel(text, merged);
    const label = text.replace(BLANK_FILL, "").replace(/\s{2,}/g, " ").replace(UNITS_TAIL, "").replace(/[:：\s]+$/, "").trim() || text;
    if (inf.type === "seleccion_unica") {
      out.push({ element: { id: uid(), type: "seleccion_unica", label: esc(label), options: makeOptions([{ text: "Sí", subs: [] }, { text: "No", subs: [] }]), helpText: help ? esc(help) : undefined, componentVersion: version("seleccion_unica") } as FormElement, confidence: inf.confidence, reason: inf.reason + " (agregué Sí / No)" });
    } else {
      const base = { id: uid(), label: esc(label), ...(help ? { helpText: esc(help) } : {}), componentVersion: version(inf.type) };
      const el = inf.type === "numero" && inf.unit ? { ...base, type: "numero", unit: inf.unit } : { ...base, type: inf.type };
      out.push({ element: el as FormElement, confidence: inf.confidence, reason: inf.reason });
    }
    i = j;
  }
  return out;
}

const UNITS_TAIL = new RegExp(`\\s*\\(?\\b(?:${UNITS.source.slice(2, -2)})\\b\\)?\\s*$`, "i");

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// Lee un grupo de opciones consecutivas desde `start`. Sangría mayor = sub-opción.
function readOptions(lines: string[], start: number) {
  const items: { text: string; subs: string[] }[] = [];
  const markers: Marker[] = [];
  let j = start;
  let baseIndent: number | null = null;
  while (j < lines.length) {
    const ln = lines[j]!;
    if (ln.trim() === "") break;
    const om = optionMarker(ln);
    const isLetter = om.marker === null && LETTER.test(ln);
    if (om.marker === null && !isLetter) break;
    const ind = indentOf(ln);
    if (baseIndent === null) baseIndent = ind;
    const text = isLetter ? ln.replace(LETTER, "").trim() : om.text;
    if (ind >= baseIndent + 2 && items.length) items[items.length - 1]!.subs.push(text);
    else { items.push({ text, subs: [] }); markers.push(isLetter ? "letter" : om.marker); }
    j++;
  }
  const multi = markers.includes("check");
  const hasBullet = markers.every((m) => m === "bullet");
  return { items, next: j, multi, hasBullet };
}

function buildChoice(label: string, help: string | undefined, items: { text: string; subs: string[] }[], multi: boolean, hasBullet: boolean, context: string): ParsedItem {
  const multiHint = MULTI_HINT.test(context);
  const isMulti = multi || multiHint;
  const type: ElementType = isMulti ? "seleccion_multiple" : "seleccion_unica";
  const confidence: PasteConfidence = multi ? "alta" : multiHint ? "media" : hasBullet && items.length > 2 ? "media" : "alta";
  const reason = multi ? "Casillas ☐ → selección múltiple" : multiHint ? "El texto pide marcar varias → selección múltiple" : hasBullet ? "Lista con viñetas → selección única (cámbiala si admite varias)" : "Opciones excluyentes → selección única";
  return {
    element: {
      id: uid(), type, label: esc(label), ...(help ? { helpText: esc(help) } : {}),
      options: makeOptions(items), componentVersion: version(type),
    } as FormElement,
    confidence, reason: reason + (items.some((o) => o.subs.length) ? " · con sub-opciones" : ""),
  };
}
