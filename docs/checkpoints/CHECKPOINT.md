checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000016
fecha: 2026-08-06
estado: completo
slice_actual: ninguno — VS-024 cerrado, completa los 9 gaps de AN-001 2.ª inspección (VS-022/023/024). Solo queda el ítem opcional/menor en BACKLOG.md, sin priorizar.

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016, VS-017, VS-018, VS-019, VS-020, VS-021, VS-022, VS-023, VS-024]

decisiones_del_dia:
  - Usuario dio automode explícito para completar los 3 gaps de AN-001 2.ª inspección (tabla de datos, select dropdown, unidad por campo numérico) usando skills (`feature-planning`) y verificación 100% en producción (sin pruebas locales manuales). Orden de implementación decidido por criterio propio: select dropdown y unidad por campo numérico primero (prerequisito), tabla de datos al final (VS-022+VS-023 en un commit, VS-024 en otro).
  - **VS-024 (tabla de datos) — decisión de diseño clave**: el tipo de celda se define por FILA, no por celda individual (documentado en `docs/engines/form.md` antes de implementar). Evita config combinatoria filas×columnas sin caso de uso real observado en la inspección del portal S&P (una fila siempre es uniforme: "Total Scope 1" es Float en las 4 columnas de año).
  - `response.ts` gana la primera nueva variante de `AnswerValue` desde VS-007 (M4): mapa anidado `rowId -> columnId -> valor` para tabla_datos, con `hasAnswer` extendido para reconocerlo. Runtime usa `<table>` HTML nativa por primera vez.
  - **Bug real encontrado y corregido durante la verificación en producción de VS-023**: input de `availableUnits` en el Builder perdía comas/espacios al escribir (controlado + recorte en cada `onChange` se comía el separador recién tecleado). Corregido a `onBlur` (no controlado), mismo fix replicado en las filas de `tabla_datos` (VS-024).
  - **Descarga de archivo autorizada explícitamente por el usuario** durante la verificación de VS-024: el fetch en página para leer el CSV export (truco usado en VS-022/023) quedó bloqueado por el filtro de seguridad del navegador en esa sesión ("Cookie/query string data") — se pidió permiso, se descargó, se leyó y se borró el archivo de prueba.
  - Todo implementado directamente (sin delegar a OpenCode) — los 3 slices tocan los mismos archivos de forma acoplada, más simple mantener consistencia con contexto completo en un solo pase que reconciliar entregas de un subagente.
  - Verificado end-to-end en producción los 3 slices: framework de prueba "VS-022-023 verify" con `seleccion_desplegable` (Moneda), `numero` con `availableUnits` (Consumo energético) y `tabla_datos` (Emisiones GHG Scope 1, filas Total Scope 1/Reportado en × columnas FY2023/FY2024). Builder, Runtime, persistencia tras recargar y export CSV confirmados para los tres. Publicación de prueba revocada al cerrar (el framework en sí queda, mismo criterio que sesiones anteriores — no hay UI de borrado de Framework).

archivos_modificados:
  - docs/engines/form.md (secciones doc-first "Select dropdown (VS-022)", "Unidad por campo numérico (VS-023)", "Tabla de datos (VS-024)", tabla de tipos v1 y "Fuera de alcance" actualizadas)
  - packages/sdk-core/src/form-schema.ts (ramas seleccion_desplegable, tabla_datos; unit/availableUnits en numero)
  - packages/sdk-core/src/component-registry.ts (entradas seleccion_desplegable, tabla_datos)
  - packages/sdk-core/src/response.ts (unitKey, tableValue/TableValue, hasAnswer extendido)
  - packages/sdk-core/src/*.test.ts (tests nuevos, 172 tests sdk-core en total)
  - apps/web/app/frameworks/.../subindicators/[subindicatorId]/page.tsx (Builder: newElement, CRUD de opciones extendido, config numero/seleccion_desplegable/tabla_datos, fix onBlur en availableUnits)
  - apps/web/app/evaluations/[token]/page.tsx (Runtime: ramas seleccion_desplegable/tabla_datos, FormTableView, selector de unidad)
  - apps/web/app/api/evaluations/[id]/export/route.ts (formatAnswer: ramas seleccion_desplegable/numero-con-unidad/tabla_datos, firma con answers)
  - apps/web/app/globals.css (.sr-only, .runtime-question__number-with-unit/__unit, .runtime-table)
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md

proximos_pasos:
  - AN-001 2.ª inspección completa (9/9 gaps cerrados). Único pendiente relacionado: ítem opcional/menor en BACKLOG.md (banner expandible, sub-opciones 2 niveles, rich text Jodit, estado por nodo, subindicadores directos bajo dimensión) — sin priorizar, el usuario no lo pidió como prioritario.
  - Pendiente no bloqueante, sigue en BACKLOG.md ("Siguiente"): proveedor de email/SMTP (ADR); TD-001+TD-002 (migraciones versionadas de Drizzle + rama Neon de test aislada); tabla de historial de revisiones de `formSchema`.
  - Al retomar sin pedido específico: revisar docs/BACKLOG.md y docs/ROADMAP.md para el siguiente ítem por prioridad — no hay nada urgente pendiente de esta sesión.

bloqueos: []

contexto_para_continuar: |
  AN-001 2.ª inspección (docs/analysis/csa-sp-global-comparison.md, sección
  "Segunda inspección") identificó 3 gaps nuevos el 2026-08-06: select
  dropdown (VS-022), unidad por campo numérico (VS-023) y tabla de datos
  (VS-024). Los 3 están cerrados y verificados en producción
  (https://csa-v3-web.vercel.app). No queda trabajo pendiente de este
  esfuerzo — solo un ítem opcional/menor sin priorizar en BACKLOG.md.

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
    transcribir desde un screenshot — evita errores de OCR visual en
    caracteres ambiguos (I/l, 0/O). Mismo truco sirve para leer una
    exportación CSV sin disparar una descarga de archivo: `await
    fetch(href).then(r => r.text())` en vez de navegar/clickear el link —
    pero este fetch puede quedar bloqueado por el filtro de seguridad del
    navegador ("Cookie/query string data") en rutas de descarga; si pasa,
    pedir permiso explícito al usuario y descargar el archivo normalmente
    (leer con Read, borrar después con Bash).
  - Los `<select>` nativos del Builder no responden a clicks por coordenada
    en las `<option>` (son popups a nivel de SO, no parte del DOM
    screenshoteable) — usar teclado (`Down`/`Up` + `Return`) tras hacer foco
    en el `<select>`, no coordenadas de click.
  - Inputs de "lista separada por coma" controlados (`value` + `onChange` que
    hace `split(",").filter(Boolean)` en cada tecla) pierden el separador que
    el usuario acaba de escribir por el re-render correctivo — usar `onBlur`
    con `defaultValue` (no controlado) para este patrón, no `onChange`.
  - Publicar un Framework de nuevo tras revocar genera un token/id de
    Evaluación NUEVO (no reactiva el anterior) — al reverificar algo después
    de revocar, hay que volver a extraer el link publicado, no reusar uno
    viejo.
  - Tras editar `packages/sdk-core`, correr `pnpm build` ahí (no solo
    `typecheck`) antes de typecheckear `apps/web` — si no, el dist/*.d.ts
    queda desactualizado y aparecen errores de tipo falsos (`never`,
    propiedades inexistentes) en el consumidor.

  Para retomar sin un pedido específico: leer este archivo, luego
  docs/BACKLOG.md ("Siguiente") y docs/ROADMAP.md para el siguiente ítem
  por prioridad.
  Comando de verificación: pnpm install && pnpm slice:close.
