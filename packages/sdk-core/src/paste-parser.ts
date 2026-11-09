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

// Celdas con varias piezas (texto + campo + lista + casilla + enlaces): el HTML las separa con " ¦ ".
const SEP = " ¦ ";
// Piezas que son un campo, lista, casilla u opción: la celda es de respuesta aunque esté en la primera columna.
const HAS_CONTROL = /(?:^|¦ )[#%]?_{3,}(?: ¦|$)|▾|☐|○/;
const REF_HINT = /m[aá]ximo de (\d+)[^¦]*\bURLs?/i;
function pieceHtml(pieces: string[]) {
  if (pieces.length === 1) return esc(pieces[0]!);
  return pieces.map((t, i) => (i === 0 ? `<p><strong>${esc(t)}</strong></p>` : `<p>${esc(t)}</p>`)).join("");
}
function cellComponents(txt: string): { comps: Record<string, unknown>[]; lists: number } | null {
  const pieces = txt.split(SEP).map((x) => x.trim()).filter(Boolean);
  const comps: Record<string, unknown>[] = [];
  let lists = 0;
  for (let i = 0; i < pieces.length; i++) {
    const t = pieces[i]!;
    const counter = t.match(/^\d+ de un m[aá]ximo de (\d+) caracteres$/i);
    if (counter) {
      const prev = [...comps].reverse().find((c) => c.type === "texto_corto");
      if (prev) prev.maxLength = Number(counter[1]);
      continue;
    }
    if (/^[#%]?_{3,}$/.test(t)) {
      if (t.startsWith("%")) comps.push({ id: uid(), type: "numero", unit: "%" });
      else if (t.startsWith("#")) comps.push({ id: uid(), type: "numero" });
      else comps.push({ id: uid(), type: "texto_corto" });
      continue;
    }
    if (t === "▾") {
      const prev = comps[comps.length - 1];
      let label: string | undefined;
      if (prev && prev.type === "texto_fijo" && /^selecci[oó]n/i.test(String(prev.content ?? "").replace(/&[a-z]+;/g, ""))) {
        label = String(prev.content);
        comps.pop();
      }
      lists++;
      comps.push({ id: uid(), type: "seleccion_desplegable", ...(label ? { label } : {}), options: [{ id: uid(), label: "Opción 1" }, { id: uid(), label: "Opción 2" }] });
      continue;
    }
    if (t.startsWith("○")) {
      const opts = [t];
      while (pieces[i + 1]?.startsWith("○")) opts.push(pieces[++i]!);
      const labels = opts.join(" ").split("○").map((x) => x.trim()).filter(Boolean);
      comps.push({ id: uid(), type: "seleccion_desplegable", options: labels.map((l) => ({ id: uid(), label: esc(l) })) });
      continue;
    }
    if (t.startsWith("☐")) {
      comps.push({ id: uid(), type: "casilla", checkboxLabel: esc(t.replace(/^☐\s*/, "")) });
      continue;
    }
    const ref = t.match(REF_HINT);
    if (ref) {
      comps.push({ id: uid(), type: "referencia", references: { maxUrls: Number(ref[1]) } });
      continue;
    }
    comps.push({ id: uid(), type: "texto_fijo", content: esc(t) });
  }
  return comps.length ? { comps, lists } : null;
}

let listsToReview = 0;
function tableConfig(rows: string[][]) {
  listsToReview = 0;
  const width = Math.max(...rows.map((r) => r.length));
  const columns = Array.from({ length: width }, () => ({ id: uid() }));
  const headerRow = {
    id: uid(),
    cells: columns.map((c, i) => ({ columnId: c.id, cellType: "texto" as const, editable: false, content: pieceHtml((rows[0]![i] ?? "").split(SEP).filter(Boolean).length ? (rows[0]![i] ?? "").split(SEP).filter(Boolean) : [""]) })),
  };
  const body = rows.slice(1);
  const dataRows = (body.length ? body : [[]]).map((r) => ({
    id: uid(),
    cells: columns.map((c, i) => {
      const txt = r[i] ?? "";
      // Primera columna con texto = nombre de la fila (solo lectura); el resto se captura.
      if (i === 0 && txt && !HAS_CONTROL.test(txt)) return { columnId: c.id, cellType: "texto" as const, editable: false, content: pieceHtml(txt.split(SEP).filter(Boolean)) };
      if (txt.includes(SEP) || REF_HINT.test(txt) || txt.includes("▾")) {
        const cc = cellComponents(txt);
        if (cc) { listsToReview += cc.lists; return { columnId: c.id, cellType: "texto" as const, editable: true, components: cc.comps as never }; }
      }
      // Celdas de respuesta: una casilla suelta "☐ Sí" → casilla; "____" → texto; varias ☐ → texto con la lista como guía.
      if (/%_{3,}/.test(txt)) return { columnId: c.id, cellType: "numero" as const, editable: true, unit: "%" };
      if (/#_{3,}/.test(txt)) {
        const hintN = txt.replace(/#_{3,}/g, "").replace(/\b(num[eé]rico|numeric)\b/gi, "").replace(/\s{2,}/g, " ").trim();
        return { columnId: c.id, cellType: "numero" as const, editable: true, ...(hintN ? { content: esc(hintN) } : {}) };
      }
      const radios = txt.split("○").map((x) => x.trim()).filter(Boolean);
      if ((txt.match(/○/g)?.length ?? 0) >= 2 && radios.length >= 2)
        return { columnId: c.id, cellType: "seleccion_desplegable" as const, editable: true, options: radios.map((r) => ({ id: uid(), label: esc(r) })) };
      const boxes = txt.match(/☐/g)?.length ?? 0;
      const single = txt.match(/^☐\s*(.+)$/);
      if (boxes === 1 && single && !/_{3,}/.test(txt)) return { columnId: c.id, cellType: "casilla" as const, editable: true, checkboxLabel: esc(single[1]!.trim()) };
      const hint = txt.replace(/☐/g, "").replace(/[#%]?_{3,}/g, "").replace(/\s{2,}/g, " ").trim();
      return { columnId: c.id, cellType: "texto" as const, editable: true, ...(hint ? { content: esc(hint) } : {}) };
    }),
  }));
  return { width, columns, lists: listsToReview, rows: [headerRow, ...dataRows] };
}

// Encabezados con año anterior al más reciente ("FY 2022"… "FY 2025") = candidatos a dato histórico.
export function pastYearHeaders(rows: string[][]): string[] {
  const head = rows[0] ?? [];
  const years = head.map((h) => Number(h.match(/\b(19|20)\d{2}\b/)?.[0] ?? NaN));
  const max = Math.max(...years.filter((y) => Number.isFinite(y)), -Infinity);
  return head.filter((_, i) => Number.isFinite(years[i]!) && years[i]! < max);
}
const histNote = (rows: string[][]) => {
  const p = pastYearHeaders(rows);
  return p.length ? ` · ${p.length} columna(s) de años anteriores (${p.join(", ")}): cárgalas como dato histórico en la pregunta` : "";
};

function buildTable(label: string, rows: string[][]): ParsedItem {
  const { width, columns, rows: trs } = tableConfig(rows);
  return {
    element: { id: uid(), type: "tabla_datos", label: esc(label), columns, rows: trs, componentVersion: version("tabla_datos") } as FormElement,
    confidence: "alta",
    reason: `Detecté una tabla de ${width} columnas${histNote(rows)}`,
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
  // Un enunciado que PIDE UNA EXPLICACIÓN es texto largo aunque nombre un tema numérico
  // ("Describa las acciones de reducción de emisiones (máx. 500 palabras)").
  const EXPLAIN = /^[¿\s]*(describ|explique|detall|justifi|comente|indique c[oó]mo|sustent|argument|resuma|especifique las|cu[aá]l es el proceso|c[oó]mo )|\b\d+\s*(palabras|caracteres)\b/;
  if (EXPLAIN.test(l) && !blank)
    return { type: "texto_largo", confidence: "alta", reason: "Pide una explicación → texto largo" };
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

type Opt = { text: string; subs: string[]; tableRows?: string[][]; tables?: string[][][]; titles?: (string | undefined)[] | undefined; refMax?: number; refPublic?: boolean; subTables?: (string[][] | undefined)[]; subsRadio?: boolean; lastSubIndent?: number; field?: { label: string; list: boolean }; pendingTitle?: string | undefined; ignored?: number };

let listsSeen = 0;
function makeOptions(items: Opt[]) {
  listsSeen = 0;
  return items.map((o) => {
    const t = o.tableRows && o.tableRows.length ? tableConfig(o.tableRows) : null;
    if (t) listsSeen += t.lists;
    if (o.field?.list) listsSeen += 1;
    const more = (o.tables ?? []).slice(1).filter((r) => r.length).map((r) => {
      const c = tableConfig(r);
      listsSeen += c.lists;
      return { columns: c.columns, rows: c.rows };
    });
    (o.tables ?? []).slice(1).filter((r) => r.length).forEach((_, k) => {
      const ttl = o.titles?.[k + 1];
      if (ttl) (more[k] as { title?: string }).title = esc(ttl);
    });
    return {
      id: uid(),
      label: esc(o.text),
      ...(o.subs.length ? {
        subOptions: o.subs.map((s, si) => {
          const rows = o.subTables?.[si];
          const st = rows && rows.length ? tableConfig(rows) : null;
          if (st) listsSeen += st.lists;
          return { id: uid(), label: esc(s), ...(st ? { table: { columns: st.columns, rows: st.rows } } : {}) };
        }),
        ...(o.subsRadio ? { subOptionsExclusive: true } : {}),
      } : {}),
      ...(t ? { table: { ...(o.titles?.[0] ? { title: esc(o.titles[0]) } : {}), columns: t.columns, rows: t.rows } } : {}),
      ...(more.length ? { moreTables: more } : {}),
      ...(o.refMax ? { references: { maxUrls: o.refMax, ...(o.refPublic ? { refType: "public" as const } : {}) } } : {}),
      ...(o.field
        ? { field: o.field.list
            ? { type: "seleccion_desplegable" as const, label: esc(o.field.label), options: [{ id: uid(), label: "Opción 1" }, { id: uid(), label: "Opción 2" }] }
            : { type: "texto_corto" as const, label: esc(o.field.label) } }
        : {}),
    };
  });
}

// ---------- Bloques de la página S&P / CSA ----------
const GUIDE = /^\s*(?:#\s*)?informaci[oó]n adicional(?:\s+y\s+.{1,60})?\s*$/i;
// Primeras palabras típicas de las opciones de una pregunta CSA cuando se pegan sin viñeta.
const OPT_START = /^(s[ií](?=[\s,.:;]|$)|no(?=[\s,.:;]|$)|la pregunta no es aplicable|la informaci[oó]n no est[aá] disponible|no aplica|n\/a)/i;
const SKIP_LINE = /^\s*(comentarios? adicionales? confidenciales?|referencias a[ñn]adidas por analistas)\b/i;
const normTitle = (l: string) => l.trim().replace(/^#+\s*/, "").replace(/[:：\s]+$/, "").toLowerCase();
const isUrl = (l: string) => /^\s*https?:\/\/\S+\s*$/i.test(l);

// Párrafos → HTML permitido por el banner (p/strong/ul/li). Títulos cortos sin punto → negrita.
function paragraphsToHtml(lines: string[]): string {
  const out: string[] = [];
  let list: string[] = [];
  const flushList = () => { if (list.length) { out.push(`<ul>${list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`); list = []; } };
  // agrupa líneas en párrafos separados por blancos
  const paras: string[][] = [];
  let cur: string[] = [];
  for (const l of lines) { if (l.trim() === "") { if (cur.length) paras.push(cur); cur = []; } else cur.push(l.trim()); }
  if (cur.length) paras.push(cur);
  for (let para of paras) {
    if (para.length >= 2 && para[0]!.length <= 60 && !/[.:?;]$/.test(para[0]!) && !isUrl(para[0]!) && !/^[-•–]/.test(para[0]!) && para[1]!.length > 40) {
      flushList();
      out.push(`<p><strong>${esc(para[0]!.replace(/^#\s+/, ""))}</strong></p>`);
      para = para.slice(1);
    }
    const joined = para.join(" ");
    const heading = /^#\s+/.test(joined) || (para.length === 1 && joined.length <= 60 && !/[.:?]$/.test(joined) && !isUrl(joined) && !/^[-•]/.test(joined));
    if (/^[-•–]\s+/.test(para[0]!) ) { para.forEach((x) => list.push(x.replace(/^[-•–]\s+/, ""))); continue; }
    flushList();
    if (heading) out.push(`<p><strong>${esc(joined.replace(/^#\s+/, ""))}</strong></p>`);
    else out.push(`<p>${esc(joined)}</p>`);
  }
  flushList();
  return out.join("");
}

// ---------- Parser principal ----------
export function parsePastedText(input: string): ParsedItem[] {
  let lines = input
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .split("\n");
  // Lo que viene después de "Comentarios adicionales confidenciales" es de la plataforma de origen, no del cuestionario.
  const cutAt = lines.findIndex((l, k) => SKIP_LINE.test(l) && lines.slice(0, k).some((x) => x.trim() !== ""));
  if (cutAt > 0) lines = lines.slice(0, cutAt);
  const out: ParsedItem[] = [];

  // Si la primera línea (título) se repite más abajo, la primera aparición sobra.
  const firstIdx = lines.findIndex((l) => l.trim() !== "");
  const skipFirst = firstIdx >= 0 && lines[firstIdx]!.trim().length <= 100 && !lines[firstIdx]!.includes("?") &&
    lines.slice(firstIdx + 1).some((l) => l.trim() !== "" && normTitle(l) === normTitle(lines[firstIdx]!));

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i]!;
    if (raw.trim() === "") { i++; continue; }
    if (skipFirst && i === firstIdx) { i++; continue; }

    if (SKIP_LINE.test(raw)) { i++; continue; }

    // Bloque "Información adicional y orientación…" → UN aviso contraíble con todo el texto guía
    if (GUIDE.test(raw)) {
      const before = new Set(lines.slice(0, i).filter((l) => l.trim() && l.trim().length <= 100 && !l.includes("?")).map(normTitle));
      let end = -1;
      for (let j = i + 1; j < lines.length; j++) if (before.has(normTitle(lines[j]!)) && lines[j]!.trim()) end = j; // última repetición del título
      if (end < 0) { for (let j = i + 1; j < lines.length; j++) if (/\?\s*$/.test(lines[j]!.trim()) && lines[j]!.trim().split(/\s+/).length >= 3) { end = j; break; } }
      if (end < 0) end = lines.length;
      let body = lines.slice(i + 1, end);
      // el título de la pregunta (h1) pegado justo antes de la pregunta no es guía
      while (body.length && body[body.length - 1]!.trim() === "") body.pop();
      if (body.length && /^#\s+/.test(body[body.length - 1]!) && end < lines.length) body.pop();
      out.push({
        element: { id: uid(), type: "banner", label: esc(raw.trim().replace(/^#\s*/, "")), content: paragraphsToHtml(body), variant: "info", startCollapsed: true, componentVersion: version("banner") } as FormElement,
        ...(body.filter((l) => l.trim()).length === 0
          ? { confidence: "baja" as const, reason: "El texto de orientación llegó VACÍO: en el portal despliega «Información adicional…» antes de copiar" }
          : { confidence: "alta" as const, reason: `Texto de orientación (${body.filter((l) => l.trim()).length} líneas) → aviso contraíble` }),
      });
      i = end;
      // si terminó en la repetición del título, esa línea se descarta
      if (i < lines.length && before.has(normTitle(lines[i]!))) i++;
      continue;
    }

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
      // Una fila de Excel con celdas vacías ("2025\t\t\t") sigue siendo fila de la tabla.
      const isRowCont = (l: string) => l.includes("\t") && !l.includes("|") && rows.length >= 1 && rows[0]!.length >= 2 && splitCells(l).length >= 2 && splitCells(l).some(Boolean);
      while (j < lines.length && lines[j]!.trim() !== "" && (isTableLine(lines[j]!) || isTableSeparator(lines[j]!) || isRowCont(lines[j]!))) {
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

    // Aviso/nota → banner: la primera línea es el título (siempre visible) y los párrafos siguientes el contenido
    if (bannerHit && !text.includes("?") && !GUIDE.test(text)) {
      const paras: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const l = lines[j]!;
        if (l.trim() === "") { j++; continue; }
        if (GUIDE.test(l) || /\?\s*$/.test(l.trim()) || optionMarker(l).marker || NUMBERED_QUESTION.test(l) || /^\s*#/.test(l) || BANNER_START.test(l.trim()) || isTableLine(l)) break;
        paras.push(l); j++;
      }
      const head = text.match(BANNER_START)![1]!;
      out.push({
        element: { id: uid(), type: "banner", label: esc(text), content: paragraphsToHtml(paras.flatMap((x) => [x, ""])), variant: /aviso|importante|atenci|advert/i.test(head) ? "warning" : "info", componentVersion: version("banner") } as FormElement,
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

    // Párrafos explicativos entre una pregunta ("…?") y su grupo de opciones → descripción de la pregunta.
    if (/\?\s*$/.test(text) && !help) {
      const gather: string[] = [];
      let q = j;
      while (q < lines.length && gather.length < 4) {
        const l = lines[q]!;
        if (l.trim() === "") { q++; continue; }
        if (optionMarker(l).marker !== null || isTableLine(l) || /^\s*#/.test(l) || NUMBERED_QUESTION.test(l) || /\?\s*$/.test(l.trim()) || OPT_START.test(l.trim()) || GUIDE.test(l)) break;
        gather.push(l.trim()); q++;
      }
      let kk2 = q;
      while (kk2 < lines.length && lines[kk2]!.trim() === "") kk2++;
      const after = lines[kk2] ?? "";
      if (gather.length && after.trim() !== "" && optionMarker(after).marker !== null) { help = gather.join(" "); j = q; }
    }

    k = peek();
    const nl = lines[k] ?? "";
    const optNext = nl.trim() !== "" && (optionMarker(nl).marker !== null || LETTER.test(nl)) && !NUMBERED_QUESTION.test(nl);
    if (optNext) {
      const { items, next, multi, hasBullet } = readOptions(lines, k);
      out.push(buildChoice(text, help, items, multi, hasBullet, text + " " + (help ?? "")));
      i = next; continue;
    }

    // Opciones sin viñeta (copiadas como texto plano): "Sí, …" / "No, …" / "La pregunta no es aplicable…"
    let kk = j;
    while (kk < lines.length && lines[kk]!.trim() === "") kk++;
    const nl2 = lines[kk] ?? "";
    if (/\?\s*$/.test(text) && nl2.trim() !== "" && OPT_START.test(nl2.trim())) {
      const items: Opt[] = [];
      let q = kk;
      while (q < lines.length) {
        const l = lines[q]!;
        if (l.trim() === "") { q++; continue; }
        if (NUMBERED_QUESTION.test(l) || SKIP_LINE.test(l) || (/\?\s*$/.test(l.trim()) && !OPT_START.test(l.trim()))) break;
        if (OPT_START.test(l.trim())) items.push({ text: l.trim(), subs: [], ignored: 0 });
        else if (items.length) items[items.length - 1]!.ignored = (items[items.length - 1]!.ignored ?? 0) + 1;
        q++;
      }
      if (items.some((o) => o.text.length >= 20)) {
        const kept: Opt[] = [];
        for (const o of items) {
          if (o.text.length < 10 && kept.length) kept[kept.length - 1]!.ignored = (kept[kept.length - 1]!.ignored ?? 0) + 1 + (o.ignored ?? 0);
          else kept.push(o);
        }
        items.splice(0, items.length, ...kept);
      }
      if (items.length >= 2) {
        const ign = items.reduce((a, o) => a + (o.ignored ?? 0), 0);
        const ch = buildChoice(text, help, items, false, false, text + " " + (help ?? ""));
        out.push(ign ? { ...ch, confidence: "media", reason: ch.reason + ` · ${ign} líneas de contenido interno de una opción quedaron sin estructura (pega desde la página web para conservarlas)` } : ch);
        i = q; continue;
      }
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

// Lee un grupo de opciones consecutivas desde `start`. Sangría mayor = contenido de la opción
// anterior: tabla → option.table, viñetas → sub-opciones, otro texto → se cuenta como sin estructura.
function readOptions(lines: string[], start: number) {
  const items: Opt[] = [];
  const markers: Marker[] = [];
  let j = start;
  let baseIndent: number | null = null;
  const nextNonBlank = (from: number) => { let k = from; while (k < lines.length && lines[k]!.trim() === "") k++; return k; };
  while (j < lines.length) {
    let ln = lines[j]!;
    if (ln.trim() === "") {
      // un blanco no corta el grupo si lo que sigue sigue siendo parte de él
      const k = nextNonBlank(j);
      if (k >= lines.length) break;
      const nxt = lines[k]!;
      const nIndent = indentOf(nxt);
      const continues = (optionMarker(nxt).marker !== null || (baseIndent !== null && nIndent > baseIndent)) && !NUMBERED_QUESTION.test(nxt);
      if (!continues || items.length === 0) break;
      j = k; ln = nxt;
    }
    const om = optionMarker(ln);
    const isLetter = om.marker === null && LETTER.test(ln) && !NUMBERED_QUESTION.test(ln);
    const ind = indentOf(ln);
    if (baseIndent === null) {
      if (om.marker === null && !isLetter) break;
      baseIndent = ind;
    }
    const nested = items.length > 0 && ind >= baseIndent + 2;
    if (nested) {
      const last = items[items.length - 1]!;
      const trimmed = ln.trim();
      const refHint = trimmed.match(/^Se permiten un m[aá]ximo de (\d+)/i);
      const titleMark = trimmed.match(/^§\s*(.+)$/);
      const fieldMark = trimmed.match(/^(.{1,80}?)\s*(_{3,}|▾)\s*$/);
      if (refHint) { last.refMax = Number(refHint[1]); last.refPublic = /p[úu]blic/i.test(trimmed); j++; continue; }
      if (titleMark) { last.pendingTitle = titleMark[1]!.trim(); j++; continue; }
      if (fieldMark && !isTableLine(ln) && om.marker === null && !isLetter) { last.field = { label: fieldMark[1]!.trim(), list: fieldMark[2] === "▾" }; j++; continue; }
      // Tabla bajo una SUB-opción (más sangría que su marcador): pertenece a esa sub-opción, no a la opción padre.
      if (om.marker === null && !isLetter && last.subs.length > 0 && last.lastSubIndent !== undefined && ind >= last.lastSubIndent + 2 && (isTableLine(ln) || isTableSeparator(ln))) {
        const si = last.subs.length - 1;
        const tabs = (last.subTables ??= []);
        const rowsOfSub = (tabs[si] ??= []);
        if (!isTableSeparator(ln)) rowsOfSub.push(splitCells(ln));
        j++; continue;
      }
      if (isTableLine(ln)) {
        // una línea en blanco entre tablas = otra tabla (una pregunta puede traer varias dentro de la misma opción)
        const prevBlank = j > 0 && lines[j - 1]!.trim() === "";
        if (!last.tables || (prevBlank && last.tables[last.tables.length - 1]!.length > 0) || last.pendingTitle !== undefined) {
          (last.tables ??= []).push([]);
          (last.titles ??= [])[last.tables.length - 1] = last.pendingTitle ?? undefined;
          last.pendingTitle = undefined;
        }
        if (!isTableSeparator(ln)) last.tables[last.tables.length - 1]!.push(splitCells(ln));
        last.tableRows = last.tables[0]!;
      }
      else if (isTableSeparator(ln)) { /* separador */ }
      else if (om.marker !== null || isLetter) { last.subs.push(isLetter ? ln.replace(LETTER, "").trim() : om.text); last.lastSubIndent = ind; if (om.marker === "radio") last.subsRadio = true; }
      else last.ignored = (last.ignored ?? 0) + 1;
      j++; continue;
    }
    if (om.marker === null && !isLetter) break;
    items.push({ text: isLetter ? ln.replace(LETTER, "").trim() : om.text, subs: [] });
    markers.push(isLetter ? "letter" : om.marker);
    j++;
  }
  const multi = markers.includes("check");
  const hasBullet = markers.every((m) => m === "bullet");
  return { items, next: j, multi, hasBullet };
}

function buildChoice(label: string, help: string | undefined, items: Opt[], multi: boolean, hasBullet: boolean, context: string): ParsedItem {
  const multiHint = MULTI_HINT.test(context);
  // ☐ es ambiguo (Word lo usa también para Sí/No). Opciones excluyentes por naturaleza
  // (Sí/No/Parcialmente/N/A…) sin pedido explícito de "marque varias" → selección única.
  const exclusiveSet = items.length >= 2 && items.length <= 5 &&
    items.some((o) => /^(s[ií]|no)(?=[\s,.:;]|$)/i.test(o.text.trim())) &&
    items.every((o) => /^(s[ií]|no|parcial(?:mente)?|n\/a|no aplica|no aplicable|en proceso|en parte|ninguno?a?)(?=[\s,.:;]|$)/i.test(o.text.trim()));
  const checkDowngraded = multi && !multiHint && exclusiveSet;
  const isMulti = (multi && !checkDowngraded) || multiHint;
  const type: ElementType = isMulti ? "seleccion_multiple" : "seleccion_unica";
  const confidence: PasteConfidence = checkDowngraded ? "media" : multi ? "alta" : multiHint ? "media" : hasBullet && items.length > 2 ? "media" : "alta";
  // "Se permiten un máximo de N, solo URL públicas" = bloque de enlaces de la pregunta, no texto de ayuda.
  const refRe = /Se permiten un m[aá]ximo de (\d+)[^.]*(?:URL|enlaces)[^.]*\.?/i;
  const refMatch = help ? help.match(refRe) : null;
  const refMax = refMatch ? Number(refMatch[1]) : 0;
  const helpClean = help ? help.replace(refRe, "").replace(/\s{2,}/g, " ").trim() : help;
  const reason = checkDowngraded ? "Opciones Sí / No / Parcialmente son excluyentes → selección única (cámbiala si admite varias)" : multi ? "Casillas ☐ → selección múltiple" : multiHint ? "El texto pide marcar varias → selección múltiple" : hasBullet ? "Lista con viñetas → selección única (cámbiala si admite varias)" : "Opciones excluyentes → selección única";
  return {
    element: {
      id: uid(), type, label: esc(label), ...(helpClean ? { helpText: esc(helpClean) } : {}),
      options: makeOptions(items), componentVersion: version(type),
      ...(refMax ? { references: { maxUrls: refMax } } : {}),
    } as FormElement,
    confidence, reason: reason + (items.some((o) => o.subs.length) ? " · con sub-opciones" : "") + (items.some((o) => o.tableRows?.length) ? " · con tabla dentro de una opción" + (items.map((o) => histNote(o.tableRows ?? [])).find(Boolean) ?? "") : "") + (listsSeen ? ` · revisa las opciones de ${listsSeen} lista(s) desplegable(s): el original no las muestra` : ""),
  };
}
