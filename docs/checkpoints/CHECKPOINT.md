checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000018
fecha: 2026-08-06
estado: completo
slice_actual: ninguno — VS-029 cerrado. Completa los 5 ítems menores de AN-001 2.ª inspección (VS-025 a VS-029) y, con ellos, el esfuerzo completo de AN-001 (9 gaps + 5 menores, 13 slices en total: VS-016 a VS-029 salvo numeración ya usada).

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016, VS-017, VS-018, VS-019, VS-020, VS-021, VS-022, VS-023, VS-024, VS-025, VS-026, VS-027, VS-028, VS-029]

decisiones_del_dia:
  - **VS-029 (el más grande y riesgoso de la sesión)**: único de los 5 ítems menores con cambio de schema real. Diseño: `dimensionId` nullable alternativo a `indicatorId` en `subindicator` (no "Indicador opcional en el medio siempre" — cambiaría la semántica de Indicador en todos los casos existentes), con `CHECK subindicator_parent_xor` en Postgres como fuente de verdad del invariante (no solo zod en el borde de la API) — mismo criterio que el resto del dominio (tenant-scoping, cascade delete viven en el schema).
  - **Antes de correr `pnpm db:push` contra Neon (producción, sin rama de test aislada — TD-002 sigue pendiente), se pidió confirmación explícita al usuario** dado que es un cambio de schema real sobre la misma base que usa producción, distinto en categoría de riesgo a las escrituras normales de la app ya autorizadas de forma general. Usuario confirmó. Cambio aditivo (nullable + FK + CHECK), verificado con una query directa a `information_schema`/`pg_constraint` después de aplicar.
  - Numeración de subindicadores directos: conveción deliberada "después de todos los Indicadores de la Dimensión", sin caso mixto observado en el portal S&P — documentado como simplificación YAGNI, no como limitación descubierta a posteriori.
  - Nueva ruta Builder (`.../dimensions/[dimensionId]/subindicators/[subindicatorId]`) delegada a OpenCode como copia mecánica de la ruta existente bajo Indicador con 3 cambios puntuales (Props, desestructuración, breadcrumb) — el agente la generó con LF en vez de CRLF (inconsistente con el resto del repo en Windows); al intentar normalizar line-endings con PowerShell se vació el archivo por error propio (mala interacción `Get-Content -LiteralPath` con rutas con corchetes `[...]`); reconstruido de inmediato con el contenido exacto ya verificado antes del incidente, sin pérdida real de trabajo. Nota para la próxima vez: preferir recrear el archivo con la herramienta de escritura antes que scripts de shell para operaciones de encoding en archivos con corchetes en la ruta (rutas de Next.js dynamic segments).
  - **Bug real encontrado en producción**: guardar una respuesta en un Subindicador directo fallaba con `subindicator_NOT_FOUND` — dos funciones distintas (`snapshotHasSubindicator` en `response-service.ts`, `findSnapshotSubindicator` en `evidence-validation.ts`) buscaban un Subindicador en el snapshot sin mirar `dim.subindicators` (directos), solo `dim.indicators[].subindicators`. Corregido en ambas, con test de integración nuevo contra Neon real. Registrado en `docs/project_notes/bugs.md`.
  - Verificado end-to-end en producción (mismo framework de prueba reutilizado de sesiones anteriores): Builder (nueva sección + ruta + breadcrumb sin "Indicador"), Runtime (árbol con el directo como hermano del Indicador, numeración "1.2", guardado tras el fix), Revisión (tarjeta al mismo nivel), export CSV (columna "Indicador" vacía). Publicación de prueba revocada al cerrar.

archivos_modificados:
  - docs/domain/evaluation-hierarchy.md (spec doc-first "Subindicadores directos bajo Dimensión (VS-029)", ya escrita en el checkpoint anterior)
  - packages/db/src/schema/domain.ts (indicatorId nullable, dimensionId nuevo, CHECK XOR, relations)
  - packages/db/src/domain/service.ts (createSubindicator con padre alternativo, listDirectSubindicators)
  - packages/db/src/domain/evaluation-service.ts (buildSnapshot con 4ta query por Dimensión, toSnapshotSubindicator extraído)
  - packages/db/src/domain/response-service.ts (fix: snapshotHasSubindicator mira dim.subindicators)
  - packages/db/src/__tests__/domain.test.ts, response.test.ts (tests de integración nuevos contra Neon real)
  - packages/sdk-core/src/domain.ts (createSubindicatorInput XOR, Subindicator nullable)
  - packages/sdk-core/src/domain.test.ts (nuevo)
  - packages/sdk-core/src/evaluation.ts (dimension.subindicators en EvaluationSnapshot, directSubindicatorNumber)
  - packages/sdk-core/src/evaluation.test.ts (tests nuevos)
  - apps/web/lib/evidence-validation.ts (fix: findSnapshotSubindicator mira dim.subindicators)
  - apps/web/app/api/subindicators/route.ts (GET acepta dimensionId o indicatorId)
  - apps/web/app/frameworks/[frameworkId]/dimensions/[dimensionId]/page.tsx (sección "Subindicadores directos")
  - apps/web/app/frameworks/[frameworkId]/dimensions/[dimensionId]/subindicators/[subindicatorId]/page.tsx (nuevo, Form Editor)
  - apps/web/app/evaluations/[token]/page.tsx (flatten/árbol/dimensionProgress con directos)
  - apps/web/app/frameworks/[frameworkId]/evaluations/[evaluationId]/review/page.tsx (SubindicatorReviewCard extraído, directos)
  - apps/web/app/api/evaluations/[id]/export/route.ts (subindicatorRows extraído, directos)
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md, docs/project_notes/bugs.md

proximos_pasos:
  - AN-001 2.ª inspección queda completa: 9 gaps (VS-016 a VS-024) + 5 ítems menores (VS-025 a VS-029). No queda ningún ítem de este esfuerzo pendiente en el backlog.
  - Pendiente no bloqueante, sigue en BACKLOG.md ("Siguiente"): proveedor de email/SMTP (ADR); TD-001+TD-002 (migraciones versionadas de Drizzle + rama Neon de test aislada — hubiera evitado la pregunta de confirmación de esta sesión al aplicar el schema de VS-029); tabla de historial de revisiones de `formSchema`.
  - Al retomar sin un pedido específico: revisar `docs/BACKLOG.md` y `docs/ROADMAP.md` para el siguiente ítem por prioridad — no hay nada urgente pendiente de esta sesión.

bloqueos: []

contexto_para_continuar: |
  AN-001 (análisis S&P Global CSA 2026) queda completamente cerrado: los 9
  gaps de la 2.ª inspección (VS-016 a VS-024) y los 5 ítems menores que el
  usuario repriorizó tras revisar el análisis costo/beneficio del agente
  (VS-025 a VS-029). Todo verificado en producción
  (https://csa-v3-web.vercel.app). No queda trabajo pendiente de este
  esfuerzo — el BACKLOG.md solo tiene pendientes no relacionados (email/SMTP,
  migraciones Drizzle, historial de formSchema).

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
    descargar: `await fetch(href).then(r => r.text())` — a veces queda
    bloqueado por el filtro de seguridad del navegador ("Cookie/query string
    data"), inconsistente entre sesiones; si pasa, pedir permiso explícito y
    descargar normalmente.
  - Los `<select>` nativos del Builder no responden a clicks por coordenada
    en las `<option>` — usar teclado (`Down`/`Up` + `Return`) tras hacer foco.
  - Inputs de "lista separada por coma" controlados (`onChange` que hace
    `split(",")` en cada tecla) pierden el separador recién escrito — usar
    `onBlur` con `defaultValue` (no controlado), no `onChange`.
  - Publicar un Framework de nuevo tras revocar genera un token/id de
    Evaluación NUEVO — al reverificar tras revocar, volver a extraer el
    link publicado (el `id` para `/api/evaluations/{id}/export` también
    cambia, no solo el token público).
  - Tras editar `packages/sdk-core`, correr `pnpm build` ahí (no solo
    `typecheck`) antes de typecheckear `apps/web`, o aparecen errores de
    tipo falsos por el dist/*.d.ts desactualizado.
  - Delegar a OpenCode funciona bien para extensiones mecánicas de un patrón
    ya existente cuando se le da el contrato exacto ya escrito en el doc —
    revisar el resultado con `git diff`/lectura directa antes de confiar en
    el reporte del agente. Si el agente genera un archivo nuevo, verificar
    line-endings (LF vs CRLF del resto del repo) — y para corregirlos, mejor
    recrear el archivo completo con la herramienta de escritura que usar
    scripts de PowerShell/Node sobre una ruta con corchetes (`[param]` de
    Next.js), que rompe con `Get-Content`/`-LiteralPath` de formas no obvias.
  - Cambios de schema en `packages/db` van directo a Neon (producción) vía
    `db:push`, sin rama de test aislada (TD-002 pendiente) — pedir
    confirmación explícita al usuario antes de correrlo, aunque el cambio
    sea aditivo/de bajo riesgo, distinto en categoría de las escrituras
    normales de la app que ya están autorizadas de forma general.
  - Buscar bugs de "no considera el nuevo caso" después de un cambio
    estructural (como VS-029): grep por el patrón de acceso antiguo
    (`.subindicators.find(`/`.some(` sin pasar por el nuevo campo) en todo
    el repo, no solo en los archivos que se tocaron a propósito — dos
    funciones de búsqueda duplicadas tenían el mismo gap en sitios
    distintos.

  Para retomar sin un pedido específico: leer este archivo, luego
  docs/BACKLOG.md ("Siguiente") y docs/ROADMAP.md para el siguiente ítem
  por prioridad.
  Comando de verificación: pnpm install && pnpm slice:close.
