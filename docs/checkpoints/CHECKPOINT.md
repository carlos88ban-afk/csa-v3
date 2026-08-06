checkpoint: c9e1a1b0-0004-4a2b-8c3d-00000000000f
fecha: 2026-08-05
estado: en_progreso
slice_actual: ninguno — VS-016 cerrado, siguiente es VS-017 (campo URL pública)

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016]

decisiones_del_dia:
  - Usuario priorizó los 6 gaps de AN-001 completos (no solo los 3 sugeridos originalmente), uno por uno como slice independiente doc-first, con OpenCode como subagente para partes mecánicas y verificación exclusivamente en producción (nada de `next dev` local para este trabajo — la excepción sigue siendo solo TD-003/Playwright).
  - VS-016 (opciones anidadas) cerrado primero, orden original del análisis. `formOption` gana `subOptions?` opcional de un solo nivel (sin recursión). Decisión clave: la respuesta de sub-opciones marcadas NO cambia la forma de `answerValue` — usa una clave sintética `${elementId}::${optionId}` en el mismo mapa `answers`, así que `response.ts`, `rule.ts` y el schema de `packages/db` quedan sin tocar. Ver `docs/engines/form.md`, sección "Opciones anidadas (VS-016)".
  - sdk-core (`formOption.subOptions` + tests) delegado a un subagente de OpenCode — mecánico, con el contrato ya completamente especificado en el doc antes de delegar. Correcto a la primera (tests verdes, typecheck limpio). Builder/Runtime (mayor juicio: dónde reaparece el sub-checklist, cómo se computa progreso) implementados directamente.
  - Bloqueo real encontrado y resuelto durante la sesión: la extensión Claude in Chrome dejó de conectar (probable causa, hipótesis del usuario confirmada indirectamente: un comando previo de "matar todos los servidores en segundo plano" corrido vía OpenCode mató el proceso `claude.exe --chrome-native-host`). Se resolvió solo con un reinicio completo de Chrome (el proceso nativo se relanzó solo, PID nuevo visible con `Get-CimInstance Win32_Process`) — no fue necesario reinstalar la extensión ni reiniciar Claude Code. Documentado aquí por si se repite: si `tabs_context_mcp` falla con "extension not connected" pese a instalación/login correctos, revisar si `claude.exe --chrome-native-host` sigue vivo antes de asumir un bug del producto.
  - Verificado end-to-end en producción con framework de prueba real ("VS-016 Test", Org VS-010, cuenta `ui-verify@example.com`): Builder guarda sub-opciones con autosave (revisionNumber incrementa), Runtime revela el sub-checklist solo bajo la opción seleccionada, marcar una sub-opción autoguarda, recarga de página confirma persistencia real (no memoria), progreso global no cuenta la sub-selección como pregunta aparte. Datos de prueba limpiados (evaluación revocada vía UI, framework borrado vía `DELETE /api/frameworks/{id}` porque el Builder no expone borrar Framework en UI, solo en API — igual que otros slices que usaron `curl`/fetch directo para verificación).

archivos_modificados:
  - docs/engines/form.md (spec doc-first "Opciones anidadas VS-016")
  - packages/sdk-core/src/form-schema.ts (formOption.subOptions), form-schema.test.ts (3 casos nuevos)
  - apps/web/app/frameworks/.../subindicators/[subindicatorId]/page.tsx (Builder: CRUD de sub-opciones)
  - apps/web/app/evaluations/[token]/page.tsx (Runtime: SubOptionsView, prop onAnswerChange)
  - apps/web/app/globals.css (.option-row-group, .sub-options, .option-row--sub)
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md

proximos_pasos:
  - Siguiente: VS-017 — campo URL pública (máx. N por pregunta), gap 2 de AN-001. Mismo proceso: doc-first en docs/engines/form.md, sdk-core (delegable a OpenCode), Builder+Runtime, verificar en producción antes de cerrar.
  - Luego en orden: VS-018 (estado por pregunta + Approved/Submitted, probablemente toca engine/persistence y roza engine/permission), VS-019 (N/A + comentarios confidenciales), VS-020 (Save/Cancel/Reset explícitos en Runtime), VS-021 (numeración automática).
  - Pendiente no bloqueante, sigue en BACKLOG.md: TD-001+TD-002 (migraciones versionadas + rama Neon de test), proveedor de email (ADR), tabla de historial de revisiones de formSchema si se necesita.

bloqueos: []

contexto_para_continuar: |
  AN-001 (análisis S&P) identificó 6 gaps aditivos sobre engine/form; el
  usuario los priorizó completos el 2026-08-05. VS-016 (opciones anidadas,
  gap 1) cerrado y verificado en producción (https://csa-v3-web.vercel.app).
  Quedan VS-017 a VS-021 (gaps 2-6), mismo proceso cada uno: doc-first →
  sdk-core (OpenCode si es mecánico) → Builder/Runtime (directo) → verificar
  en producción con claude-in-chrome → limpiar datos de prueba → cerrar
  (CHANGELOG/issues/CHECKPOINT/BACKLOG).
  Nota operativa: si claude-in-chrome no conecta, verificar primero que
  `claude.exe --chrome-native-host` siga vivo antes de escalar — un reinicio
  de Chrome alcanza para relanzarlo si algo lo mató (ver decisiones_del_dia).
  Para retomar: leer este archivo, luego docs/BACKLOG.md ("Siguiente"),
  empezar VS-017 con docs/analysis/csa-sp-global-comparison.md como
  referencia del gap.
  Comando de verificación: pnpm install && pnpm slice:close.
