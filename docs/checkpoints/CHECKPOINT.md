checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000012
fecha: 2026-08-06
estado: en_progreso
slice_actual: ninguno — VS-019 cerrado, siguiente es VS-020 (Save/Cancel/Reset explícitos en Runtime)

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016, VS-017, VS-018, VS-019]

decisiones_del_dia:
  - Usuario priorizó los 6 gaps de AN-001 completos; van 4 de 6 cerrados (VS-016 a VS-019), mismo proceso cada uno: doc-first → sdk-core vía OpenCode → Builder/Runtime directo → verificar en producción → limpiar → cerrar.
  - VS-019 (N/A + comentario confidencial) cerrado. Antes de diseñar se le preguntó al usuario si el comentario confidencial debía excluirse del CSV (dado que en S&P es un campo interno) — respuesta: debe incluirse, igual que cualquier respuesta. Esto resolvió la única ambigüedad real del slice.
  - Decisión de diseño explícita y documentada: "confidencial" es una etiqueta de UI/convención, NO control de acceso real — la plataforma no tiene niveles de visibilidad por campo (`permission.md` ya excluye *access-control* granular por recurso de v1), así que no se inventó ocultamiento por rol. Mismo patrón de clave sintética que VS-016/VS-017/VS-018 (`${elementId}::na`, `${elementId}::comment`), cuarta vez que extiende `engine/persistence` sin tocar `packages/db`.
  - **Bug real encontrado y corregido durante la verificación en producción** (no solo cobertura nueva): la Regla C del resguardo server-side de VS-018 (`assertPublicResponseUpdateAllowed`) seguía comparando con `hasAnswer` en vez de `isAnswered` — permitía en el cliente pulsar "Marcar como completo" sobre una pregunta N/A sin respuesta real, pero el servidor la rechazaba con 403 `element_LOCKED` genuino (reproducido en producción, no en teoría). Corregido en ambos lados con el mismo criterio (`isAnswered`), cubierto con un test nuevo que reproduce el caso exacto, y verificado de nuevo en producción tras el fix con éxito.
  - sdk-core (`naKey`, `commentKey`, `isAnswered`) delegado a OpenCode con el contrato ya escrito en el doc — correcto a la primera (el bug encontrado después fue de integración cruzada con la lógica de VS-018, no del código que escribió OpenCode). `apps/web` (Runtime, Revisión, export) implementado directamente.
  - Verificado end-to-end en producción con framework de prueba ("VS-019 Test", Org VS-010): N/A bloquea el input principal (confirmado que no acepta texto tras marcarlo), comentario confidencial persiste tras recargar, "Marcar como completo" funciona con N/A (tras el fix), CSV confirma `"N/A"` en Respuesta + `"Completado"` en Estado + el comentario en su columna, página de Revisión muestra Pill "N/A" y el comentario. Datos de prueba limpiados.

archivos_modificados:
  - docs/engines/persistence.md (spec doc-first "N/A + comentario confidencial VS-019", fix de Regla C documentado ahí mismo), export.md (columna Comentario confidencial)
  - packages/sdk-core/src/response.ts (naKey, commentKey, isAnswered, fix de Regla C), response.test.ts (tests nuevos incluido el del bug)
  - apps/web/app/evaluations/[token]/page.tsx (NaCommentRow, progressOf con isAnswered)
  - apps/web/app/frameworks/[frameworkId]/evaluations/[evaluationId]/review/page.tsx (Pill N/A + comentario visible)
  - apps/web/app/api/evaluations/[id]/export/route.ts (columna Comentario confidencial, N/A literal en Respuesta)
  - apps/web/app/globals.css (.runtime-question__na)
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md

proximos_pasos:
  - Siguiente: VS-020 — botones Save/Cancel/Reset explícitos en Runtime, gap 5 de AN-001. Hoy todo es autosave silencioso (debounce 1500ms); hay que decidir la semántica exacta antes de codificar: Save = forzar el autosave pendiente ya (sin cambio de comportamiento real, solo UX); Cancel = descartar ediciones locales no guardadas y volver al último estado confirmado por el servidor; Reset = restaurar la última respuesta guardada (¿es lo mismo que Cancel, o Reset vuelve a vacío?). Diseñar doc-first en persistence.md antes de tocar código — aclarar con el usuario si Reset implica vaciar la respuesta o solo descartar cambios no guardados.
  - Luego: VS-021 (numeración automática del árbol y las preguntas) — cierra los 6 gaps de AN-001.
  - Pendiente no bloqueante, sigue en BACKLOG.md: TD-001+TD-002 (migraciones versionadas + rama Neon de test), proveedor de email (ADR), tabla de historial de revisiones de formSchema si se necesita.

bloqueos: []

contexto_para_continuar: |
  AN-001 (análisis S&P) identificó 6 gaps aditivos sobre engine/form; el
  usuario los priorizó completos el 2026-08-05, alcance completo (no
  versiones mínimas) cuando hay ambigüedad. VS-016 a VS-019 cerrados y
  verificados en producción (https://csa-v3-web.vercel.app). Quedan VS-020
  y VS-021. Mismo proceso cada uno: doc-first → sdk-core (OpenCode si es
  mecánico) → Builder/Runtime (directo) → verificar en producción con
  claude-in-chrome → limpiar datos de prueba → cerrar (CHANGELOG/issues/
  CHECKPOINT/BACKLOG).
  Antes de VS-020: aclarar con el usuario la semántica exacta de "Reset"
  (¿vuelve a vacío o solo descarta cambios no guardados?) — ver
  proximos_pasos, es una pregunta de alcance genuina.
  Nota operativa: si claude-in-chrome no conecta, verificar primero que
  `claude.exe --chrome-native-host` siga vivo antes de escalar.
  Para retomar: leer este archivo, luego docs/BACKLOG.md ("Siguiente"),
  empezar VS-020 con docs/analysis/csa-sp-global-comparison.md como
  referencia del gap.
  Comando de verificación: pnpm install && pnpm slice:close.
