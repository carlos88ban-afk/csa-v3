import sanitizeHtml from "sanitize-html";

// Comentario confidencial con formato WYSIWYG (VS-030, docs/adr/0006, sucesor
// de VS-028/markdown-lite — ver docs/engines/form.md). El valor de
// `commentKey` (response.ts) sigue siendo `string`, ahora HTML en vez de
// markdown-lite. Alcance mínimo deliberado: negrita/itálica/lista, igual que
// el markdown-lite que reemplaza — no todo el vocabulario que TipTap podría
// producir.
//
// Reusado también por el contenido del banner (VS-038, docs/engines/form.md
// "Banner: contenido con formato") — el nombre quedó atado al caso de uso
// original (comentario confidencial), pero la función es genérica: cualquier
// campo `string` que use el mismo `RichTextEditor` (apps/web/components/
// rich-text-editor.tsx) sanitiza con este mismo motor, sin allowlist nueva.

const ALLOWED_TAGS = ["strong", "em", "p", "br", "ul", "li"];

// Se sanitiza tanto al guardar (cliente, tras `editor.getHTML()`) como al
// leer (Revisión, defensa en profundidad) — mismo criterio de "nunca confiar
// en HTML guardado" que ya usaba `escapeHtml` en el markdown-lite anterior.
export function sanitizeCommentHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {},
    // TipTap con StarterKit reducido no debería emitir nada fuera de la
    // allowlist, pero si lo hace, se descarta el tag y se conserva el texto
    // interno (comportamiento por defecto de sanitize-html) en vez de
    // vaciar el comentario completo.
  }).trim();
}

// Para exportación CSV (texto plano, no HTML) — mismo rol que
// `stripLiteMarkdown` antes: un CSV no debe mostrar markup que el usuario no
// escribió con intención literal. Convierte cierres de bloque (`</p>`,
// `</li>`, `<br>`) a salto de línea ANTES de despojar tags — si no,
// sanitize-html concatena el texto de bloques adyacentes sin espacio
// ("<p>Hola</p><p>Mundo</p>" -> "HolaMundo").
export function stripCommentHtml(html: string): string {
  const withBreaks = html.replace(/<\/(p|li)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n");
  return sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
