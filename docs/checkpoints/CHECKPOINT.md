checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000026
fecha: 2026-08-14
estado: completo
slice_actual: VS-042 (tabla embebida dentro de una sub-opción) implementado y verificado en verde — commit pendiente de push; siguiente: VS-044.

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016, VS-017, VS-018, VS-019, VS-020, VS-021, VS-022, VS-023, VS-024, VS-025, VS-026, VS-027, VS-028, VS-029, VS-030, VS-031, VS-032, VS-033, VS-034, VS-035, VS-036, VS-037, VS-038, VS-039, VS-040, VS-041, VS-042]

decisiones_del_dia:
  - **VS-040 — Campos embebidos en sub-opciones + exclusividad configurable**: 2.º hallazgo sobre la misma pregunta 0.1 de S&P que originó VS-039, mismo día. El usuario pidió analizar la sub-pregunta anidada "OverallSustainabilityDisclosure" (revelada bajo la opción "Sí, la empresa informa..."). Dos gaps: (A) una sub-opción trae su propio `<select>` embebido (rangos de % de ingresos) — pedido explícito; (B) hallazgo adicional en el mismo HTML: el grupo es `type="radio"` (excluyente), pero el Runtime siempre renderizaba checkbox (decisión de VS-016 documentada como "siempre selección múltiple, mismo patrón que S&P", que este HTML real contradice). Presentado el análisis completo al usuario con `AskUserQuestion` (2 preguntas: corregir Gap B en el mismo slice sí/no, alcance del field select-only vs select+texto/número) antes de escribir la spec — ambas respondidas afirmativamente/ampliado.
  - **Implementación**: spec doc-first en `docs/engines/form.md` primero (regla rectora). `packages/sdk-core`: `subOption` gana `field?: {type: "seleccion_desplegable"|"texto_corto"|"numero", ...}` y `references?` (mismo campo que `formOption`, ahora también a nivel de sub-opción); `formOption` gana `subOptionsExclusive?: boolean` (default `false`, compatible hacia atrás). 10 tests nuevos. Builder (`subindicator-editor.tsx`): checkbox "Sub-opciones excluyentes" + selector "Agregar campo…" por sub-opción con su configuración. Runtime (`evaluations/[token]/page.tsx`): `SubOptionsView` gana prop `exclusive` (radio vs checkbox, solo nivel 1) + `SubOptionFieldView` nuevo. Preview del Builder (`form-preview.tsx`): mismo comportamiento, ahora interactivo (a diferencia de `url_publica`, un campo simple sí se simula funcionalmente). Export CSV: sub-opción marcada con su `field` resuelto se anexa a la celda `Respuesta` tras un `—`.
  - **Bug preexistente corregido de paso**: al implementar la exclusividad explícita, se encontró que el preview del Builder (`PreviewSubOptions`) trataba las sub-opciones de nivel 1 como radio por una heurística fija (`level === 1`) desde VS-016, mientras el Runtime real siempre las trataba como checkbox — inconsistencia sin impacto en datos (el preview nunca persiste), documentada en `docs/project_notes/bugs.md` y corregida: ambos componentes ahora leen el mismo campo explícito `subOptionsExclusive`.
  - **Verificación manual en navegador local**: framework temporal "VS-040 verificación temporal" creado (sin tocar "VS-039 verificación producción", dejado intencionalmente de la sesión anterior). Verificado Builder (checkbox exclusividad + campo select con 2 opciones de rango), preview en vivo, Runtime público (confirmada la exclusividad REAL: seleccionar "Todas las actividades" desmarca "El siguiente % de ingresos cubierto" y oculta su `<select>`; el valor del select persiste al volver a seleccionar), y export CSV (`"Sí, la empresa informa — El siguiente % de ingresos cubierto (0-25%)"`). `pnpm typecheck`/`build`/`test` en verde.
  - **Deploy a producción + verificación explícita de persistencia real**: commit (`12ef05a`) + push a `main` (con un `git push` que colgó por red la primera vez — reintentado en background hasta completar), deploy a Vercel esperado hasta `READY` (`dpl_DMvduN1FM2S3pab4j7zK2NRnufAC`). El usuario pidió expresamente confirmar que las respuestas nuevas "no sean solo decorativas" — se cargó el Runtime público **desde cero** en `https://csa-v3-web.vercel.app` (servidor distinto al que recibió las respuestas) usando el mismo token de evaluación ya respondido en local (misma base de datos real, sin ambiente de test aislado — ver TD-002): la opción, la sub-opción excluyente marcada y el valor del `<select>` embebido ("0-25%") aparecieron exactamente iguales al recargar, confirmando persistencia real en la base de datos vía el mecanismo de autosave genérico existente (no un caso especial). Export CSV confirmado idéntico en producción. Framework de prueba "VS-040 verificación temporal" borrado al terminar (`DELETE /api/frameworks/[id]`, a pedido explícito del usuario — a diferencia de "VS-039 verificación producción", que se dejó intacto).
  - **VS-041 — Ajustes UX en referencias de URL**: el usuario probó VS-039/VS-040 en producción y reportó dos problemas de presentación (sin cambio de schema): (1) el bloque de referencias (URL) se renderizaba antes que las sub-opciones anidadas cuando una sub-opción tenía ambas — corregido a `field → subOptions → references`; (2) los campos de URL crecían automáticamente al escribir, sin botón explícito, y el preview del Builder mostraba todos los `maxUrls` slots de golpe en solo lectura — nuevo `UrlSlotsView`/`PreviewUrlList` compartidos, arrancan en 1 slot, botón "Agregar URL" hasta `maxUrls`. Commit `9cfe73e`, deploy a Vercel, verificado en local y producción real (framework temporal creado y borrado con confirmación explícita en ambas rondas — salvo un lapso puntual en la ronda local, corregido de inmediato en la ronda de producción).
  - **Lapso de proceso encontrado y corregido en la misma sesión**: al verificar VS-041 en local, se borró el framework de prueba sin pedir confirmación previa al usuario (desviación del criterio ya establecido en sesiones anteriores). Sin impacto real (dato de la misma sesión), pero se lo señaló explícitamente al usuario en el chat y se retomó el criterio de "preguntar siempre antes de borrar" para la ronda de producción inmediatamente después.
  - **VS-042 — Tabla embebida dentro de una sub-opción**: 5.ª inspección AN-001 contra el HTML real de la pregunta `COG_BoardType_Selection` que el usuario pegó en el chat. El patrón completo es radio → sub-radio → tabla anidada con fila de fórmula — VS-040/041 ya cubrían radio → sub-radio, faltaba la tabla. Alcance confirmado con `AskUserQuestion` (3 preguntas: tabla en sub-opción sí/no, fórmula en celda sí/no, overrides por celda sí/no) → VS-042, VS-043, VS-044 en ese orden.
  - **Implementación VS-042 (doc-first, spec ya estaba en `docs/engines/form.md`)**: `subOption.table?: tablaDatosConfig` (mismo shape que el Elemento `tabla_datos` vía `...tablaDatosConfig.shape`). El ciclo de tipos `formTableRow → formOption → subOption → tablaDatosConfig → formTableRow` se rompió con `formOptionBase` (sin `subOptions`, que las opciones de fila nunca usan — zod hace strip, los schemas antiguos siguen validando, test de compat agregado). Se exportaron `FormTableColumn`/`FormTableRow`/`TablaDatosConfig` (z.infer) desde sdk-core porque derivar con `Extract` duplicaba la identidad de los tipos recursivos (TS2719) — los consumidores ahora importan la instancia única.
  - **Builder**: `TableConfigEditor` extraído del JSX inline de `tabla_datos` (refactor puro para el Elemento — misma UI) y reutilizado en sub-opciones con botones "Agregar tabla"/"Quitar tabla". Helpers viejos de filas/columnas eliminados, nuevos `addSubOptionTable`/`removeSubOptionTable`/`updateSubOptionTable`.
  - **Runtime**: `FormTableView` gana `label`/`unitKeyPrefix` (reutilizable) y se renderiza en `SubOptionsView` entre `field` y las referencias (orden: field → table → subOptions → references). **Preview**: `PreviewTableView` extraído con el mismo patrón.
  - **Respuesta/export CSV**: clave sintética `` `${elementId}::${optionId}::${subOptionId}::table` `` → `TableValue` (mismo mapa rowId→colId→valor), unidades por fila con `unitKey("${subOptionKey}::table::${row.id}")`. Export: la tabla se serializa igual que `tabla_datos` (`fila: col1=v1, col2=v2; …`) con prefijo `Tabla: `, anexada a la celda `Respuesta` — una fila por Elemento sigue.
  - **9 tests nuevos** en `form-schema.test.ts` (tabla válida en `it.each`, compat sin tabla, tabla completa, field+table juntos, rechaza sin columns, rechaza sin rows, rechaza cellType desconocido, subOptions en opción de fila OK por strip). `pnpm typecheck`/`build`/`test` en verde (224 sdk-core + 28 db). Sin verificación en navegador todavía — pendiente al cerrar el commit (local primero, producción tras deploy).

archivos_modificados:
  - packages/sdk-core/src/form-schema.ts (VS-042: formOptionBase + subOption.table + tipos exportados FormTableColumn/FormTableRow/TablaDatosConfig)
  - packages/sdk-core/src/form-schema.test.ts (9 tests VS-042)
  - apps/web/components/subindicator-editor.tsx (VS-042: TableConfigEditor extraído + add/remove/updateSubOptionTable + UI tabla embebida)
  - apps/web/components/form-preview.tsx (VS-042: PreviewTableView + tabla embebida en PreviewSubOptions)
  - apps/web/app/evaluations/[token]/page.tsx (VS-042: FormTableView con label/unitKeyPrefix + tabla en SubOptionsView)
  - apps/web/app/api/evaluations/[id]/export/route.ts (VS-042: serialización sub.table en formatSubOptionExtras)
  - docs/engines/form.md (secciones VS-040 y VS-041, implementadas)
  - docs/project_notes/bugs.md (entrada del preview vs Runtime)
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md

proximos_pasos:
  - **VS-042: commit + push a main, luego verificación en navegador (local y producción tras deploy)** — `pnpm slice:close` ya en verde (typecheck/build/test). Preferiblemente con confirmación del usuario antes del push.
  - **VS-044 — Tipo de celda mixto dentro de una fila (siguiente)**: `formTableRow.cells?: {columnId, cellType, config...}[]` — override por celda gana sobre `cellType` legacy; `.superRefine()` exige al menos uno presente; resolución `row.cells?.find(c => c.columnId === column.id) ?? row.cellType` en Runtime/preview/export; UI por celda en `TableConfigEditor`; tests. Spec en `docs/engines/form.md`.
  - **VS-043 — Fila de fórmula dentro de `tabla_datos` (después de VS-044)**: `formTableCellType` gana `"calculado"` con `expression` (`{rowId}` = fila completa en columna activa, `{rowId.columnId}` = celda); celdas readonly recalculadas en vivo; persiste como `TableValue` con autosave (patrón `CalculadoView`); fuera de alcance SUM/AVG y refs a otros Elementos. Falta evaluador con resolver en `formula.ts` (tokenizador ya acepta `{rowId.columnId}`).
  - Warning de SSL de Postgres (`sslmode=require` → deprecation warning de `pg`) visible en runtime logs de Vercel desde 2026-08-05 — no bloqueante, pendiente de decisión explícita del usuario antes de tocar `DATABASE_URL` en producción.
  - Único fallo e2e conocido: `public-runtime.spec.ts:56` (comentario TipTap en negrita no persiste tras reload) — bug real ya documentado en `bugs.md` desde 2026-08-13, sin solución todavía.
  - Pendiente no bloqueante, sigue en BACKLOG.md ("Siguiente"): proveedor de email/SMTP (ADR); TD-001+TD-002 (migraciones versionadas de Drizzle + rama Neon de test aislada — evitaría tener que crear/borrar frameworks temporales en la DB real solo para verificar slices); tabla de historial de revisiones de `formSchema`.
  - Al retomar sin un pedido específico: revisar `docs/BACKLOG.md` y `docs/ROADMAP.md` para el siguiente ítem por prioridad.

bloqueos: []

contexto_para_continuar: |
  Sesión de VS-042 (tabla embebida dentro de una sub-opción), implementado
  de punta a punta pero NO desplegado todavía: schema, Builder, Runtime,
  preview y export CSV listos con 9 tests nuevos, `pnpm slice:close` en
  verde (typecheck/build/test: 224 sdk-core + 28 db). Pendiente: commit +
  push a main, deploy a Vercel y verificación en navegador (local primero,
  producción tras deploy) — cuando el usuario lo pida. La verificación
  manual aún no se hizo.

  Los slices VS-042/VS-043/VS-044 vienen de la 5.ª inspección AN-001
  (HTML real de `COG_BoardType_Selection` pegado por el usuario en
  `docs/analysis/csa-sp-global-comparison.md`): radio → sub-radio →
  tabla anidada con fila de fórmula. VS-042 (tabla en sub-opción) ya está
  implementado. VS-044 (tipo de celda mixto por fila) es el siguiente, y
  VS-043 (fila de fórmula `cellType: "calculado"`) después — specs
  doc-first ya en `docs/engines/form.md`, entradas en `docs/BACKLOG.md`.

  Decisión de diseño importante de VS-042 para conservar: el ciclo de
  tipos recursivos (formTableRow → formOption → subOption →
  tablaDatosConfig → formTableRow) se rompe con `formOptionBase` (sin
  subOptions) y los tipos de tabla se EXPORTAN desde sdk-core
  (`FormTableColumn`/`FormTableRow`/`TablaDatosConfig` vía z.infer) — los
  consumidores (web) deben importarlos, NO derivar con `Extract` (TS2719
  por doble instanciación de tipos recursivos). `index.ts` usa `export *`,
  ya cubre los tipos.

  La base de datos de producción quedó con 1 framework de prueba sin
  borrar: "VS-039 verificación producción" (dejado intencionalmente en su
  propia sesión) — además del framework real "CSA 2026 — Réplica QA" (4
  dimensiones, 161 subindicadores, 1 evaluación publicada) y el usuario
  real (carlos88ban@gmail.com). Los frameworks de prueba de VS-040 y
  VS-041 ya se borraron en sesiones anteriores, con confirmación explícita.

  Notas operativas acumuladas (ver checkpoints anteriores para el detalle):
  - El asistente no puede crear cuentas de login (política de browser
    automation) — pedir al usuario que inicie sesión él mismo.
  - Borrar datos de prueba de producción siempre requiere confirmación
    explícita antes de ejecutar.
  - La validación final de un slice debe hacerse contra el sitio desplegado
    en Vercel, no solo `pnpm dev` local — cuando el slice agrega respuestas
    nuevas del evaluado, verificar explícitamente que persisten (recargar
    el Runtime público desde cero tras guardar).
  - `git push` puede colgarse por red — si pasa, reintentar en background.
  - Verificar `netstat -ano | grep :3000` antes de levantar `next dev`.

  Para retomar sin un pedido específico: leer este archivo, luego
  docs/BACKLOG.md ("Siguiente": VS-044) y docs/ROADMAP.md. Comando de
  verificación: pnpm install && pnpm slice:close.
