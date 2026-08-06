// Comentario confidencial con formato (VS-028, docs/engines/form.md
// "Comentario confidencial con formato"). Subconjunto deliberadamente
// mínimo — negrita/itálica/lista, no un parser de markdown completo — sin
// dependencia nueva de UI (ver decisión en el doc).

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Escapa PRIMERO, así ningún HTML del usuario sobrevive — solo los 3
// patrones reconocidos generan tags fijos (<strong>/<em>/<ul><li>), nunca
// HTML arbitrario de la entrada.
export function renderLiteMarkdown(text: string): string {
  const lines = escapeHtml(text).split("\n");
  const html: string[] = [];
  let inList = false;
  for (const line of lines) {
    const isListItem = line.startsWith("- ");
    if (isListItem && !inList) {
      html.push("<ul>");
      inList = true;
    } else if (!isListItem && inList) {
      html.push("</ul>");
      inList = false;
    }
    const content = isListItem ? line.slice(2) : line;
    const formatted = content.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
    html.push(isListItem ? `<li>${formatted}</li>` : `${formatted}<br/>`);
  }
  if (inList) html.push("</ul>");
  return html.join("");
}

// Para exportación CSV (texto plano, no HTML): despoja la sintaxis en vez
// de renderizarla — un CSV no debe mostrar asteriscos que el usuario no
// escribió con intención literal.
export function stripLiteMarkdown(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^- /, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1"))
    .join("\n");
}
