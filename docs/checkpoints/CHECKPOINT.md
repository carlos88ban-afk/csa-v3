checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000017
fecha: 2026-08-06
estado: completo
slice_actual: ninguno — VS-025 a VS-028 cerrados. Queda VS-029 (subindicadores directos bajo Dimensión) como último ítem de AN-001 2.ª inspección, sin slice abierto — el único con cambio de schema.

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016, VS-017, VS-018, VS-019, VS-020, VS-021, VS-022, VS-023, VS-024, VS-025, VS-026, VS-027, VS-028]

decisiones_del_dia:
  - **El usuario revirtió la decisión de no-priorización del agente**: tras evaluar los 5 ítems menores de AN-001 2.ª inspección con un análisis costo/beneficio (registrado en `docs/project_notes/decisions.md`), el usuario dijo explícitamente que sí valían la pena y pidió continuar el cierre de gaps usando skills + OpenCode + verificación en producción. La decisión anterior se marcó como "Superada" en decisions.md, no se borró — mismo criterio que ADRs superadas.
  - Los 5 ítems se desglosaron como VS-025 a VS-029 en `docs/BACKLOG.md`, orden decidido por costo/riesgo creciente: banner (025), sub-opciones 2 niveles (026), estado por nodo (027), comentario rich text (028), subindicadores directos bajo dimensión (029, el único con cambio de schema, al final).
  - **VS-025 banner expandible**: `expandable?: boolean` aditivo, sin campo de contenido nuevo — colapsa/expande el mismo `label` (no hay evidencia de un campo "resumen" separado en la inspección del portal).
  - **VS-026 sub-opciones a 2 niveles**: tope FIJO en 2, no recursión genérica (`subSubOption` no tiene su propio `subOptions`) — sin caso observado de un 3er nivel, criterio YAGNI ya usado en el proyecto. Builder + Runtime delegados a OpenCode con el contrato exacto ya escrito en el doc; revisado con `git diff` línea por línea antes de aceptar (coincidió exactamente con el patrón pedido).
  - **VS-027 estado por nodo**: agregación derivada (no persistida) de `progressOf` ya existente — mismo criterio que la numeración VS-021 ("derivada, no persistida"). Cero cambios en `packages/db`.
  - **VS-028 comentario confidencial con formato — decisión explícita de NO agregar dependencia de UI nueva** (Jodit/TipTap/etc.): markdown-lite hecho a mano (`apps/web/lib/lite-markdown.ts`, negrita/itálica/lista únicamente, ~40 líneas), justificado por el mismo precedente NFR-3 que ya usa el CSV manual sin librería (`export.md`). `commentKey` sigue siendo `string` — cero cambios de contrato.
  - Todos verificados juntos en un solo pase de producción (mismo framework de prueba reutilizado de VS-022/023/024) para eficiencia — banner colapsa/expande, 3 niveles de sub-opciones en cascada, `tree-dot` de Dimensión/Indicador cambia de color con progreso, comentario en negrita en Revisión y sin sintaxis en el CSV.
  - Descarga de CSV autorizada explícitamente por el usuario de nuevo (el fetch en página funcionó esta vez, sin bloqueo del filtro de seguridad — inconsistente entre sesiones, no asumir que siempre funciona).

archivos_modificados:
  - docs/engines/form.md (secciones doc-first "Banner expandible/colapsable (VS-025)", "Sub-opciones a 2 niveles (VS-026)", "Comentario confidencial con formato (VS-028)")
  - docs/engines/persistence.md (sección doc-first "Estado por nodo en el árbol (VS-027)")
  - docs/domain/evaluation-hierarchy.md (sección doc-first "Subindicadores directos bajo Dimensión (VS-029)" — spec lista, implementación pendiente)
  - packages/sdk-core/src/form-schema.ts (banner.expandable, formOption.subOptions con 2do nivel)
  - packages/sdk-core/src/form-schema.test.ts (tests nuevos)
  - apps/web/app/frameworks/.../subindicators/[subindicatorId]/page.tsx (Builder: checkbox expandible, CRUD addSubSubOption/updateSubSubOption/removeSubSubOption)
  - apps/web/app/evaluations/[token]/page.tsx (Runtime: BannerView, SubOptionsView recursivo, indicatorProgress/dimensionProgress/progressState, NaCommentRow con toolbar)
  - apps/web/app/frameworks/[frameworkId]/evaluations/[evaluationId]/review/page.tsx (comentario renderizado con renderLiteMarkdown)
  - apps/web/app/api/evaluations/[id]/export/route.ts (comentario despojado con stripLiteMarkdown)
  - apps/web/lib/lite-markdown.ts (nuevo — renderLiteMarkdown/stripLiteMarkdown)
  - apps/web/app/globals.css (.runtime-banner--expandable, .rich-toolbar, .comment-preview)
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md, docs/project_notes/decisions.md

proximos_pasos:
  - VS-029 (subindicadores directos bajo Dimensión) es el último ítem de AN-001 2.ª inspección — especificación ya completa en `docs/domain/evaluation-hierarchy.md`. Requiere: `packages/db/src/schema/domain.ts` (`indicatorId` nullable + `dimensionId` nullable alternativo + CHECK XOR), `createSubindicatorInput` (sdk-core, superRefine XOR), `EvaluationSnapshot` (dimension.subindicators nuevo), `buildSnapshot` (evaluation-service.ts, 4ta query), numeración `directSubindicatorNumber`, API routes, nueva ruta Builder bajo Dimensión, Runtime (flatten/nav/dimensionProgress), Revisión, export CSV. Es el único de los 5 con cambio de schema — mayor riesgo, sin slice abierto todavía.
  - Pendiente no bloqueante, sigue en BACKLOG.md ("Siguiente"): proveedor de email/SMTP (ADR); TD-001+TD-002 (migraciones versionadas de Drizzle + rama Neon de test aislada); tabla de historial de revisiones de `formSchema`.

bloqueos: []

contexto_para_continuar: |
  AN-001 2.ª inspección: de los 5 ítems menores repriorizados por el usuario
  el 2026-08-06 (tras revertir la no-priorización inicial del agente), 4
  están cerrados y verificados en producción (VS-025 a VS-028). Queda
  VS-029 (subindicadores directos bajo Dimensión) — el más grande de los 5,
  único con cambio de schema en packages/db. Especificación doc-first ya
  completa en docs/domain/evaluation-hierarchy.md, sección "Subindicadores
  directos bajo Dimensión (VS-029)" — leerla antes de implementar, tiene el
  diseño completo (CHECK XOR, numeración, todos los call-sites afectados).

  Notas operativas acumuladas durante la sesión (útiles si se repiten):
  - Si claude-in-chrome no conecta, verificar que `claude.exe
    --chrome-native-host` siga vivo antes de escalar (reinicio de Chrome
    suele bastar).
  - Si un push no genera deployment en Vercel (ni "Canceled" en el dashboard),
    ver el incidente detallado en el CHANGELOG de VS-020 — commit vacío +
    "Redeploy" manual sobre ESE commit vacío resuelve.
  - Al copiar tokens/URLs desde la UI para navegar con claude-in-chrome,
    extraer el valor exacto vía `javascript_tool`
    (`[...document.querySelectorAll('a')].map(a => a.href)`) en vez de
    transcribir desde un screenshot. Mismo truco para leer un CSV export sin
    descargar: `await fetch(href).then(r => r.text())` — pero este fetch a
    veces queda bloqueado por el filtro de seguridad del navegador ("Cookie/
    query string data"), inconsistente entre sesiones; si pasa, pedir
    permiso explícito y descargar normalmente (leer con Read, borrar con
    Bash después).
  - Los `<select>` nativos del Builder no responden a clicks por coordenada
    en las `<option>` — usar teclado (`Down`/`Up` + `Return`) tras hacer foco.
  - Inputs de "lista separada por coma" controlados (`onChange` que hace
    `split(",")` en cada tecla) pierden el separador recién escrito — usar
    `onBlur` con `defaultValue` (no controlado), no `onChange`.
  - Publicar un Framework de nuevo tras revocar genera un token/id de
    Evaluación NUEVO — al reverificar tras revocar, volver a extraer el
    link publicado.
  - Tras editar `packages/sdk-core`, correr `pnpm build` ahí (no solo
    `typecheck`) antes de typecheckear `apps/web`, o aparecen errores de
    tipo falsos por el dist/*.d.ts desactualizado.
  - Delegar a OpenCode funciona bien para extensiones mecánicas de un patrón
    ya existente (ej. VS-026: mismo CRUD un nivel más adentro) cuando se le
    da el contrato exacto ya escrito en el doc — revisar el resultado con
    `git diff` antes de confiar en el reporte del agente.

  Para retomar sin un pedido específico: leer este archivo, luego
  docs/BACKLOG.md ("Siguiente") y docs/ROADMAP.md para el siguiente ítem
  por prioridad.
  Comando de verificación: pnpm install && pnpm slice:close.
