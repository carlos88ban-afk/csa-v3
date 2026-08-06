checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000010
fecha: 2026-08-05
estado: en_progreso
slice_actual: ninguno — VS-017 cerrado, siguiente es VS-018 (estado por pregunta + Approved/Submitted)

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016, VS-017]

decisiones_del_dia:
  - Usuario priorizó los 6 gaps de AN-001 completos, uno por uno como slice independiente doc-first, OpenCode como subagente para partes mecánicas, verificación exclusivamente en producción.
  - VS-016 (opciones anidadas) cerrado. Bloqueo real durante la sesión: la extensión Claude in Chrome dejó de conectar porque un comando previo de "matar servidores en segundo plano" corrido vía OpenCode mató `claude.exe --chrome-native-host`; se resolvió solo con reiniciar Chrome por completo (el proceso nativo se relanzó solo).
  - VS-017 (campo URL pública) cerrado segundo, gap 2 en el orden original del análisis. Nuevo tipo de Elemento `url_publica` (`maxUrls?`, default 3) — complementario a `evidencia` (archivos) en vez de una config de ese tipo, porque S&P los trata como dos formas de evidencia conceptualmente distintas. Misma estrategia de bajo blast-radius que VS-016: la respuesta reutiliza `string[]` (variante ya existente de `answerValue`), cero cambios en `response.ts`. Decisión nueva de este slice: los slots vacíos del Runtime (mientras el evaluado sigue escribiendo) se filtran antes de escribir en `answers` — un array `[""]` habría hecho que `hasAnswer()` (compartida por todos los tipos) contara erróneamente un slot en blanco como "respondido".
  - sdk-core (`formElement.url_publica` + `component-registry.ts` + tests) delegado a OpenCode — mecánico, contrato ya completo en el doc antes de delegar, correcto a la primera. Builder/Runtime/export (mayor juicio: UX de slots acotados, filtrado de vacíos, formato CSV) implementados directamente.
  - Encontrado y corregido durante `pnpm slice:close`: un timeout de hook en `evaluation.test.ts` (`packages/db`) — confirmado como flakiness real de latencia contra Neon (no relacionado a los cambios de este slice, que no tocan `evaluation-service.ts`), reproducido en verde en un segundo intento inmediato. Documentado aquí por si vuelve a aparecer: no bloquea el cierre del slice si el retry pasa limpio y el diff no toca el área que falló.
  - Verificado end-to-end en producción con framework de prueba ("VS-017 Test", Org VS-010): Builder guarda `maxUrls` con autosave, Runtime respeta el tope (no ofrece un tercer slot con `maxUrls: 2`), recarga de página confirma persistencia real, `Exportar CSV` (probado con `fetch` directo a la URL real del link, no solo clic) devuelve `"url1; url2"` en la columna Respuesta. Datos de prueba limpiados (evaluación revocada vía UI, framework borrado vía `DELETE /api/frameworks/{id}` igual que en VS-016).

archivos_modificados:
  - docs/engines/form.md (spec doc-first "Campo URL pública VS-017"), docs/engines/export.md (formato de url_publica en CSV)
  - packages/sdk-core/src/form-schema.ts (formElement.url_publica), component-registry.ts (entrada nueva), form-schema.test.ts (2 casos nuevos)
  - apps/web/app/frameworks/.../subindicators/[subindicatorId]/page.tsx (Builder: config maxUrls)
  - apps/web/app/evaluations/[token]/page.tsx (Runtime: UrlPublicaView)
  - apps/web/app/api/evaluations/[id]/export/route.ts (formatAnswer: rama url_publica)
  - apps/web/app/globals.css (.runtime-url-list)
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md

proximos_pasos:
  - Siguiente: VS-018 — estado por pregunta + flujo Approved/Submitted, gap 3 de AN-001. Más complejo que VS-016/VS-017: hoy el progreso es % derivado en cliente, sin estado persistido por elemento ni concepto de aprobación/envío. Probablemente necesita: (a) decidir si el estado vive en `response.answers` (paralelo, otra clave sintética) o en una columna/tabla nueva de `packages/db`, (b) decidir qué rol puede transicionar a Approved/Submitted (roza `engine/permission.md`, RBAC ya existente owner/editor/evaluador). Diseñar doc-first en `docs/engines/persistence.md` antes de tocar código — este es el gap con más superficie de decisión de los 6, dedicar tiempo al diseño antes de delegar nada a OpenCode.
  - Luego en orden: VS-019 (N/A + comentarios confidenciales), VS-020 (Save/Cancel/Reset explícitos), VS-021 (numeración automática).
  - Pendiente no bloqueante, sigue en BACKLOG.md: TD-001+TD-002 (migraciones versionadas + rama Neon de test), proveedor de email (ADR), tabla de historial de revisiones de formSchema si se necesita.

bloqueos: []

contexto_para_continuar: |
  AN-001 (análisis S&P) identificó 6 gaps aditivos sobre engine/form; el
  usuario los priorizó completos el 2026-08-05. VS-016 (opciones anidadas)
  y VS-017 (campo URL pública) cerrados y verificados en producción
  (https://csa-v3-web.vercel.app). Quedan VS-018 a VS-021 (gaps 3-6), mismo
  proceso cada uno: doc-first → sdk-core (OpenCode si es mecánico) →
  Builder/Runtime (directo) → verificar en producción con claude-in-chrome
  → limpiar datos de prueba → cerrar (CHANGELOG/issues/CHECKPOINT/BACKLOG).
  VS-018 es el más grande de los que quedan — requiere diseño explícito
  antes de escribir código (ver proximos_pasos).
  Nota operativa: si claude-in-chrome no conecta, verificar primero que
  `claude.exe --chrome-native-host` siga vivo antes de escalar — un reinicio
  de Chrome alcanza para relanzarlo si algo lo mató.
  Para retomar: leer este archivo, luego docs/BACKLOG.md ("Siguiente"),
  empezar VS-018 con docs/analysis/csa-sp-global-comparison.md como
  referencia del gap.
  Comando de verificación: pnpm install && pnpm slice:close.
