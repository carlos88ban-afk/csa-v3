// HTML copiado (de la página de CSA, Word, Typeform, etc.) → texto estructurado que entiende
// `parsePastedText`: ○ radio, ☐ casilla, ___ campo, "| a | b |" tablas, sangría = contenido de
// una opción, "# " títulos. Así el texto es el formato común y el usuario lo ve (y puede editarlo).

const BLOCK = new Set(["DIV", "P", "SECTION", "ARTICLE", "UL", "OL", "LI", "TABLE", "FORM", "HEADER", "FOOTER", "MAIN", "ASIDE", "TR", "TD", "TH", "TBODY", "THEAD", "HR", "FIGURE", "DL", "DT", "DD", "BLOCKQUOTE", "PRE", "LEGEND", "FIELDSET", "H1", "H2", "H3", "H4", "H5", "H6"]);
const PAD = "    ";

const clean = (s: string) =>
  s.replace(/ /g, " ").replace(/\s+/g, " ").replace(/\d+ de un m[aá]ximo de \d+ caracteres/gi, "").replace(/m[aá]ximo \d+ caracteres/gi, "").trim();

function token(el: Element): string {
  const t = (el.getAttribute("type") || "text").toLowerCase();
  if (t === "radio") return "○ ";
  if (t === "checkbox") return "☐ ";
  if (t === "hidden" || t === "button" || t === "submit" || el.classList.contains("sims-select-trigger")) return "";
  // El portal marca el tipo de dato de cada campo: números (Float/Integer) y porcentajes (Percent).
  const dpd = el.getAttribute("data-dpd-type") || "";
  if (dpd === "Percent") return "%_____ ";
  if (dpd === "Float" || dpd === "Integer") return "#_____ ";
  return "_____ ";
}

function inl(node: Node): string {
  let out = "";
  node.childNodes.forEach((c) => {
    if (c.nodeType === 3) out += c.textContent ?? "";
    else if (c.nodeType === 1) {
      const e = c as Element;
      if (e.tagName === "INPUT") out += token(e);
      else if (e.tagName === "TEXTAREA") out += "_____ ";
      else if (e.tagName === "BR") out += " ";
      else if (BLOCK.has(e.tagName)) out += " " + inl(e) + " ";
      else out += inl(e);
    }
  });
  return out;
}

function isLeaf(e: Element) {
  return !e.querySelector([...BLOCK].filter((t) => t !== "BR").join(",").toLowerCase());
}

function cut(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, "") + "…";
}

function table(t: Element, ind: number, out: string[]) {
  const rows = [...t.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tr")];
  const lines: string[] = [];
  rows.forEach((r, idx) => {
    const cells = [...r.children].filter((c) => c.tagName === "TD" || c.tagName === "TH");
    const txt = cells.map((c, i) => cut(clean(inl(c)).replace(/\|/g, "/"), i === 0 ? 110 : 70));
    if (txt.some((x) => x)) lines.push(PAD.repeat(ind) + "| " + txt.join(" | ") + " |");
    void idx;
  });
  if (lines.length) { out.push(...lines); out.push(""); }
}

function nestedOf(li: Element) {
  return [...li.querySelectorAll("table, ol, ul")].filter((n) => n.parentElement?.closest("table, ol, ul, li") === li);
}

function li(e: Element, ind: number, out: string[]) {
  const input = [...e.querySelectorAll("input")].find((i) => i.closest("li") === e && ["radio", "checkbox"].includes((i.getAttribute("type") || "").toLowerCase()));
  const nested = nestedOf(e);
  const copy = e.cloneNode(true) as Element;
  copy.querySelectorAll("table, ol, ul, input, textarea").forEach((n) => n.remove());
  const text = clean(inl(copy));
  const marker = input ? token(input) : "- ";
  if (text || input) out.push(PAD.repeat(ind) + marker + text);
  nested.forEach((n) => (n.tagName === "TABLE" ? table(n, ind + 1, out) : list(n, ind + 1, out)));
}

function list(e: Element, ind: number, out: string[]) {
  [...e.children].forEach((c) => (c.tagName === "LI" ? li(c, ind, out) : block(c, ind, out)));
}

function block(el: Element, ind: number, out: string[]) {
  let buf = "";
  const flush = () => { const t = clean(buf); if (t) out.push(PAD.repeat(ind) + t); buf = ""; };
  el.childNodes.forEach((c) => {
    if (c.nodeType === 3) { buf += c.textContent ?? ""; return; }
    if (c.nodeType !== 1) return;
    const e = c as Element;
    const tag = e.tagName;
    if (tag === "INPUT") { buf += token(e); return; }
    if (tag === "TEXTAREA") { buf += "_____ "; return; }
    if (tag === "BR") { buf += " "; return; }
    if (tag === "TABLE") { flush(); table(e, ind, out); return; }
    if (tag === "UL" || tag === "OL") { flush(); list(e, ind, out); return; }
    if (tag === "LI") { flush(); li(e, ind, out); return; }
    if (/^H[1-6]$/.test(tag)) { flush(); const t = clean(inl(e)); if (t) { out.push(""); out.push(PAD.repeat(ind) + "# " + t); } return; }
    // banner expandible: "Aviso: título" + detalle
    if (e.classList.contains("banner-header")) { flush(); const t = clean(inl(e)); if (t) out.push(PAD.repeat(ind) + t); out.push(""); return; }
    if (BLOCK.has(tag)) {
      flush();
      if (isLeaf(e)) { const t = clean(inl(e)); if (t) { out.push(PAD.repeat(ind) + t); out.push(""); } }
      else block(e, ind, out);
      return;
    }
    buf += inl(e);
  });
  flush();
}

export function looksLikeHtml(s: string) {
  return /^\s*<(!doctype|html|body|section|div|table|ol|ul|p|h[1-6]|form|article)\b/i.test(s);
}

export function htmlToMarkedText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,button,select,nav,noscript,template,[hidden],.jodit-source__mirror,.custom-bar,.navigation,.MuiTable-root,.sims-button,.reference-table").forEach((n) => n.remove());
  doc.querySelectorAll<HTMLElement>("[style]").forEach((n) => { if (/display:\s*none/i.test(n.getAttribute("style") ?? "")) n.remove(); });
  const sp = doc.querySelectorAll(".questionnaire-banner, .questionaires-list");
  const out: string[] = [];
  if (sp.length) sp.forEach((r) => block(r, 0, out));
  else block(doc.body, 0, out);

  let lines = out;
  if (sp.length) {
    // recorta el texto de la plataforma (pasos para iniciar el cuestionario) antes del primer bloque útil
    const start = lines.findIndex((l) => /^\s*(aviso|nota|importante|requisito|# informaci[oó]n adicional|informaci[oó]n adicional)/i.test(l));
    if (start > 0) lines = lines.slice(start);
    // y los comentarios confidenciales / referencias de analistas de la plataforma de origen
    const end = lines.findIndex((l) => /^\s*(comentarios? adicionales? confidenciales?|referencias a[ñn]adidas por analistas)/i.test(l));
    if (end > 0) lines = lines.slice(0, end);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Lo que se pega (portapapeles) → texto listo para interpretar.
export function clipboardToText(dt: DataTransfer | null): string {
  if (!dt) return "";
  const html = dt.getData("text/html");
  const plain = dt.getData("text/plain");
  if (html && /<(table|input|li|h[1-6])\b/i.test(html)) {
    const t = htmlToMarkedText(html);
    if (t.length > 0) return t;
  }
  if (looksLikeHtml(plain)) {
    const t = htmlToMarkedText(plain);
    if (t.length > 0) return t;
  }
  return plain;
}
