// HTML copiado (de la página de CSA, Word, Typeform, etc.) → texto estructurado que entiende
// `parsePastedText`: ○ radio, ☐ casilla, ___ campo, "| a | b |" tablas, sangría = contenido de
// una opción, "# " títulos. Así el texto es el formato común y el usuario lo ve (y puede editarlo).

const BLOCK = new Set(["DIV", "P", "SECTION", "ARTICLE", "UL", "OL", "LI", "TABLE", "FORM", "HEADER", "FOOTER", "MAIN", "ASIDE", "TR", "TD", "TH", "TBODY", "THEAD", "HR", "FIGURE", "DL", "DT", "DD", "BLOCKQUOTE", "PRE", "LEGEND", "FIELDSET", "H1", "H2", "H3", "H4", "H5", "H6"]);
const PAD = "    ";

const clean = (s: string, keepCounter = false) => {
  const t = s.replace(/ /g, " ").replace(/\s+/g, " ");
  return (keepCounter ? t : t.replace(/\d+ de un m[aá]ximo de \d+ caracteres/gi, "").replace(/m[aá]ximo \d+ caracteres/gi, "")).trim();
};

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

// Una celda de tabla puede mezclar texto, campos, listas, casillas y enlaces: cada pieza va
// separada por " ¦ " para que el intérprete la reconstruya completa (sin recortar nada).
function cellText(c: Element): string {
  const pieces: string[] = [];
  let buf = "";
  const flush = () => { const t = clean(buf, true).replace(/\|/g, "/"); if (t) pieces.push(t); buf = ""; };
  const walk = (n: Node) => {
    n.childNodes.forEach((ch) => {
      if (ch.nodeType === 3) { buf += ch.textContent ?? ""; return; }
      if (ch.nodeType !== 1) return;
      const e = ch as Element;
      const tg = e.tagName;
      if (e.matches(".sims-input.reference")) {
        // widget de enlaces: se conserva solo su indicación ("máximo de N …"); lo adjuntado es respuesta, no estructura
        flush();
        const hint = clean(e.querySelector(".hint")?.textContent ?? "");
        pieces.push(hint || "Se permiten un máximo de 3 URL");
        return;
      }
      if (e.matches(".reference-table, .reference-add")) { flush(); return; }
      if (tg === "INPUT") {
        const tk = token(e).trim();
        if (tk === "○" || tk === "☐") buf += tk + " ";
        else if (e.classList.contains("sims-select-trigger")) { flush(); pieces.push("▾"); }
        else if (tk) { flush(); pieces.push(tk); }
        return;
      }
      if (tg === "TEXTAREA") { flush(); pieces.push("_____"); return; }
      if (tg === "BR") { flush(); return; }
      if (e.classList.contains("sims-select-trigger")) { flush(); pieces.push("▾"); return; }
      if (BLOCK.has(tg)) { flush(); walk(e); flush(); return; }
      walk(e);
    });
  };
  walk(c);
  flush();
  return pieces.join(" ¦ ");
}

function table(t: Element, ind: number, out: string[]) {
  const rows = [...t.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tr")];
  const lines: string[] = [];
  rows.forEach((r, idx) => {
    const cells = [...r.children].filter((c) => c.tagName === "TD" || c.tagName === "TH");
    const txt = cells.map((c) => cut(cellText(c), 1500));
    if (txt.some((x) => x)) lines.push(PAD.repeat(ind) + "| " + txt.join(" | ") + " |");
    void idx;
  });
  if (lines.length) { out.push(...lines); out.push(""); }
}

function nestedOf(li: Element) {
  return [...li.querySelectorAll("table, ol, ul")].filter((n) => n.parentElement?.closest("table, ol, ul, li") === li);
}

// <li> del portal: párrafo de la opción + widgets (enlaces, campos con rótulo, tablas con título).
function liSp(e: Element, level: Element, ind: number, out: string[], marker: string) {
  let first = true;
  const kids = [...level.children];
  for (let k = 0; k < kids.length; k++) {
    const c = kids[k]!;
    if (c.tagName === "P" && first) { out.push(PAD.repeat(ind) + marker + clean(inl(c))); first = false; continue; }
    if (first) { out.push(PAD.repeat(ind) + marker); first = false; }
    if (c.matches(".sims-input.reference")) {
      const n = clean(c.querySelector(".hint, .level, span")?.textContent ?? c.textContent ?? "").match(/\d+/)?.[0] ?? "3";
      const pub = /p[úu]blic/i.test(clean(c.querySelector(".hint")?.textContent ?? ""));
      out.push(PAD.repeat(ind + 1) + (pub ? `Se permiten un máximo de ${n}, solo URL públicas` : `Se permiten un máximo de ${n} URL`));
      continue;
    }
    const nxt = kids[k + 1];
    if (c.tagName === "P") {
      const label = clean(inl(c));
      if (nxt?.querySelector("table") && !nxt.closest(".reference-table")) { out.push(PAD.repeat(ind + 1) + "§ " + label); continue; }
      if (nxt && (nxt.querySelector("input.sims-select-trigger") || nxt.querySelector("select"))) { out.push(PAD.repeat(ind + 1) + label + " ▾"); k++; continue; }
      if (nxt?.querySelector("input, textarea")) { out.push(PAD.repeat(ind + 1) + label + " _____"); k++; continue; }
      if (label) out.push(PAD.repeat(ind + 1) + label);
      continue;
    }
    // Las listas ANTES que las tablas: una lista de sub-opciones con tablas dentro no debe colapsar a su primera tabla.
    if (c.tagName === "OL" || c.tagName === "UL") { list(c, ind + 1, out); continue; }
    if (c.tagName === "TABLE" || c.querySelector("table")) {
      const tb = c.tagName === "TABLE" ? c : c.querySelector("table")!;
      if (!tb.classList.contains("reference-table") && !tb.closest(".reference-table")) table(tb, ind + 1, out);
      continue;
    }

  }
}

function li(e: Element, ind: number, out: string[]) {
  const levelDiv = [...e.children].find((x) => x.classList.contains("level"));
  if (levelDiv && levelDiv.querySelector(":scope > p")) {
    const inp = [...e.querySelectorAll("input")].find((i) => i.closest("li") === e && ["radio", "checkbox"].includes((i.getAttribute("type") || "").toLowerCase()));
    liSp(e, levelDiv, ind, out, inp ? token(inp) : "- ");
    return;
  }
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
  doc.querySelectorAll("select").forEach((sel) => {
    const opts = [...sel.querySelectorAll("option")].map((o) => (o.textContent ?? "").trim()).filter(Boolean);
    const useful = opts.length >= 3 ? opts.slice(1) : opts;
    sel.replaceWith(doc.createTextNode(useful.length >= 2 ? useful.map((o) => "○ " + o).join(" ") : " "));
  });
  doc.querySelectorAll("script,style,button,nav,noscript,template,[hidden],.jodit-source__mirror,.custom-bar,.navigation,.MuiTable-root,.sims-button,.reference-table").forEach((n) => n.remove());
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
