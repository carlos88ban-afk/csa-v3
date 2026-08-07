# 0006 — Editor WYSIWYG (TipTap) para el comentario confidencial

Estado: Accepted (implementado en VS-030, 2026-08-06)

## Contexto

VS-028 (2026-08-06, ver `docs/engines/form.md` "Comentario confidencial con formato") decidió deliberadamente **no** adoptar un editor rich-text (Jodit, TipTap, Slate) para el campo "Comentario confidencial" (`commentKey`, VS-019) y usar en su lugar un `<textarea>` plano con 3 botones que envuelven la selección en una sintaxis markdown-lite hecha a mano (`apps/web/lib/lite-markdown.ts`). La razón documentada: el campo no tiene ningún renderizado especial visible para el evaluado que lo escribe (solo se lee formateado en la página de Revisión, de uso administrativo) y el proyecto tiene precedente de evitar dependencias de UI nuevas sin justificar (`docs/engines/export.md`).

El usuario pidió revertir esa decisión para lograr paridad visual y de comportamiento con el portal S&P Global CSA 2026, que usa un editor WYSIWYG real (Jodit) para el mismo campo — el evaluado ve el texto formateado mientras escribe, no una sintaxis de marcado sin interpretar.

## Decisión

Adoptar **TipTap** (`@tiptap/react` + `@tiptap/pm`, sobre ProseMirror) en vez de Jodit literal, con `StarterKit` reducido a solo los nodos/marcas que el markdown-lite anterior soportaba (párrafo, negrita, itálica, lista de viñetas — se deshabilitan encabezados, blockquote, code, code block, regla horizontal, lista ordenada y strike) más `@tiptap/extension-character-count` para el límite de 5000 caracteres que antes daba `maxLength` del `<textarea>` nativo.

El contenido pasa a guardarse como **HTML sanitizado** en vez de markdown-lite — `commentKey` sigue guardando `string` (cero cambio de contrato en `packages/sdk-core/src/response.ts`, tal como ya anticipaba VS-028). La sanitización (`sanitizeCommentHtml`/`stripCommentHtml`, nuevas en `packages/sdk-core/src/rich-text.ts`, con `sanitize-html`) ocupa el rol que antes tenía el escape-primero de `lite-markdown.ts`: una allowlist mínima de tags (`strong`, `em`, `p`, `br`, `ul`, `li`), sin atributos permitidos — se sanitiza tanto al guardar (cliente) como al leer (Revisión, defensa en profundidad).

## Alternativas descartadas

- **Jodit literal** (la librería que usa el portal S&P): es vanilla-JS orientada a manipulación directa del DOM, no nativa de React; su wrapper React (`jodit-react`) tiene mantenimiento intermitente y no sigue el modelo de reconciliación de React de forma tan directa como una librería React-first — mayor riesgo de bugs de sincronización de estado. Se descarta pese a ser la opción de paridad literal con el portal.
- **Slate**: más flexible (renderizado 100% custom de nodos), pero exige escribir el renderer de cada nodo a mano — sobre-ingeniería para un campo con 3 formatos (negrita/itálica/lista).
- **Seguir con markdown-lite (VS-028)**: ya evaluado y descartado — el usuario pidió explícitamente paridad WYSIWYG real, no una mejora incremental del textarea.
- **contentEditable a mano sin librería**: evita toda dependencia nueva, pero reimplementar selección/serialización/pegado de forma robusta y accesible es más riesgo (correctness, XSS vía paste) que adoptar una librería madura y ampliamente usada en producción (ProseMirror).

## Consecuencias

- Nuevas dependencias: `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-character-count` (`apps/web`); `sanitize-html` (`packages/sdk-core`, agnóstico de UI, reutilizable en Revisión/export sin duplicar lógica de sanitización).
- **Corte limpio, sin migración de datos**: no había comentarios reales en producción con la sintaxis markdown-lite vieja al momento de este cambio (confirmado con el usuario) — no se agrega detección/conversión de formato viejo vs. nuevo.
- `apps/web/lib/lite-markdown.ts` eliminado; `sanitizeCommentHtml`/`stripCommentHtml` viven en `packages/sdk-core` en vez de `apps/web/lib` específicamente para heredar cobertura de Vitest (`apps/web` no tiene test runner activo todavía).
- El toolbar del Runtime pasa de manipular `selectionStart`/`selectionEnd` de un `<textarea>` a ejecutar comandos TipTap (`editor.chain().focus().toggleBold().run()`), con estado activo reflejado vía `aria-pressed`.

## Riesgos monitoreados

- **XSS vía HTML almacenado**: mitigado con `sanitizeCommentHtml` en dos puntos (al guardar en el cliente y al leer en Revisión), allowlist mínima sin atributos — cubierto con tests unitarios (`packages/sdk-core/src/rich-text.test.ts`) que incluyen intentos de `<script>`, `onerror`, `javascript:`.
- **Bundle size**: TipTap + ProseMirror agregan peso al bundle cliente de `apps/web`; se mitiga cargando solo las extensiones necesarias (no `StarterKit` completo) — no medido con `@size-limit` a la fecha de esta ADR, revisar si se vuelve relevante.
- **Accesibilidad de `contentEditable`**: ProseMirror maneja navegación de teclado estándar; se preservan `aria-label`/`aria-pressed` en el toolbar y `aria-label` en el área editable, igual criterio WCAG 2.2 AA que el resto del Runtime (VS-015). Sin auditoría formal de lector de pantalla a la fecha — pendiente si se reporta un problema real.
