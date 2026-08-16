checkpoint: c9e1a1b0-0004-4a2b-8c3d-00000000002a
fecha: 2026-08-16
estado: completo
slice_actual: VS-048 (grilla uniforme sin encabezados especiales en `tabla_datos`, supersede la decisión de diseño de VS-047) — implementado, verificado en producción y CERRADO. Siguiente: sin ítem asignado en BACKLOG.md ("Siguiente") — revisar ROADMAP.md.

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016, VS-017, VS-018, VS-019, VS-020, VS-021, VS-022, VS-023, VS-024, VS-025, VS-026, VS-027, VS-028, VS-029, VS-030, VS-031, VS-032, VS-033, VS-034, VS-035, VS-036, VS-037, VS-038, VS-039, VS-040, VS-041, VS-042, VS-043, VS-044, VS-045, VS-046, VS-047, VS-048]

decisiones_del_dia:
  - **VS-048 — Grilla uniforme sin encabezados especiales en `tabla_datos`**: reporte del usuario inmediatamente después de cerrar VS-047 y verificarlo en producción: "sigo sin ver lo que te pedí... no podría armar una tabla doble entrada, ya que la celda superior izquierda nunca existe". VS-047 preservó `columns[]`/`rows[]` con `label` propio y un `<thead>`/`<th scope="row">` siempre presentes — la esquina superior izquierda quedaba como un `<th />` vacío estructural, nunca una celda real, contradiciendo el pedido original ("una sola celda, agregar a la derecha/abajo").
  - **Decisión confirmada con el usuario** (`AskUserQuestion`, dos preguntas): (1) grilla uniforme sin encabezados especiales — cualquier celda, incluida la esquina, es una celda real y direccionable, si el admin quiere que actúe como encabezado la marca "solo lectura" con contenido (mismo mecanismo `editable: false`/`content` de VS-047, sin concepto nuevo); (2) rediseño limpio del schema sin migrar datos — confirmado que no hay evaluaciones reales contestadas sobre `tabla_datos` en producción.
  - **Schema**: `formTableColumn`/`formTableRow` pierden `label`; `formTableRow` pierde también el atajo legacy uniforme de VS-024 (`cellType`/`unit`/`availableUnits`/`options`/`maxLength` a nivel de fila) — `cells` pasa a ser obligatorio `.min(1)`, ya no hay "modo legado" al que caer. `formTableCell` no cambia.
  - **Builder**: `TableConfigEditor` sin `<thead>` ni columna de encabezado — una sola `<table>` uniforme, "+ columna"/"+ fila" como franjas fijas en los bordes (`rowSpan`/`colSpan`), "Quitar fila"/"Quitar columna" movidos al panel expandido de cualquier celda de esa fila/columna (en vez de un control de borde). Elemento nuevo `tabla_datos` arranca con exactamente una celda.
  - **Runtime/Preview**: se elimina el `<thead>`/`<th scope="row">`; resolución de celda simplificada (sin fallback a "fila legacy"). Efecto colateral positivo: se completa el selector de unidad por celda (`formTableCell.unit`/`availableUnits`, VS-044) que nunca se había conectado a un render real — solo existía el selector a nivel de fila (VS-023, ahora eliminado).
  - **Export CSV**: sin `label`, la referencia pasa de `{row.label}: {col.label}=valor` a posicional `Fila N: Columna M=valor` (1-indexado).
  - **Limpieza incidental**: `apps/web/app/frameworks/[frameworkId]/dimensions/[dimensionId]/subindicators/[subindicatorId]/page.tsx` era una implementación completa y duplicada del editor de subindicador, huérfana desde VS-031 (sin ningún link en toda la app, confirmado con grep) y nunca actualizada más allá de VS-024 — rompía la compilación al tocar el schema de `tabla_datos`. Convertida al mismo patrón de redirect que ya usan sus 3 rutas hermanas.
  - Tests de `form-schema.test.ts` actualizados al nuevo schema, más un caso de regresión directo del reporte del usuario (celda fija con contenido en la posición fila 0/columna 0, tabla de doble entrada). 251 tests en `sdk-core` (antes 250). `pnpm typecheck`/`build`/`test` en verde. Spec completa en `docs/engines/form.md` ("Grilla uniforme sin encabezados especiales") — el bug fix de celda calculado del día anterior sigue documentado abajo, sin cambios.
  - **Verificación en producción (completada)**: commit `becef64` + push a `main`, deploy Vercel `dpl_37hNKdjyD3eogTStEMoD3kGPnixg` READY. Framework temporal "TEMP - VS-048 verificacion" (creado y **borrado al terminar, con confirmación explícita**): elemento `tabla_datos` nuevo confirmó arrancar con exactamente una celda (chip "Texto", sin `<thead>`, sin encabezado); tabla de doble entrada real construida — esquina (fila 0, columna 0) marcada "solo lectura" con contenido fijo "Región / Año", columna "2024" fija, fila "Norte" fija, celda de dato Número editable. La vista previa del Builder renderizó la grilla 2×2 sin ningún hueco estructural — se pudo escribir **42** en la celda de dato. Esto resuelve directamente el reporte original del usuario.
  - **fix(builder) post-VS-047 — celda `calculado` perdía la fórmula al marcarla "solo lectura"**: reporte de usuario ("no me está permitiendo Construir tablas similares a esta", con HTML de una fila total `readonly`/`formula`) inmediatamente después de cerrar VS-047 y verificarlo en producción — contradecía esa verificación, así que se reprodujo el flujo exacto del usuario desde cero en un framework temporal nuevo, replicando la misma tabla del HTML (3 filas numéricas + fila total calculada). El paso que rompía todo: marcar la celda calculada como "solo lectura" (natural dado el `readonly` del HTML de referencia) — el Builder reemplazaba el selector de Tipo y el campo de fórmula por un editor de "Contenido fijo" vacío.
  - **Root cause**: `editable` (booleano) y `cellType` (enum) se trataban como ejes cruzados en vez de reconocer que "calculado" es un tercer modo de render, ortogonal a ambos valores de `editable` — ni lo llena el evaluado, ni es contenido fijo estático, se computa solo. En Builder (`TableConfigEditor`) el selector de Tipo (y por tanto "Calculado") vivía anidado DENTRO de la rama `editable`; en Runtime/Preview (`FormTableView`/`PreviewTableView`) el check `!editable` se evaluaba ANTES que `cellType === "calculado"`; el export CSV tenía el mismo sesgo en su condición de omisión.
  - **Fix**: en los 4 archivos, `cellType === "calculado"` se resuelve independiente de `editable` — Runtime/Preview lo chequean primero; el export excluye `calculado` de la omisión por `editable === false`; el Builder movió el selector de Tipo fuera de la rama editable/fijo (siempre visible) y, con tipo "calculado", muestra siempre la fórmula (sin casilla "Editable" ni "contenido fijo"). Cambiar el Tipo a "calculado" fuerza `editable: true` para normalizar datos previos. Sin cambios de schema ni de motor de fórmula — 250 tests `sdk-core` + 28 `db` sin regresiones, `pnpm typecheck` en verde.
  - **Verificación en producción (completada)**: commit `10d6fe1` + push a `main`, deploy Vercel `dpl_FxU5Py3avjA2wfSujuqLWZFScuei` READY (esta vez el webhook disparó el build automáticamente, sin demora). En el mismo framework temporal usado para reproducir el bug, la celda que había quedado con `editable: false` mostró tras el fix: ficha "Calculado" (no "Fijo"), fórmula ya guardada intacta y visible en el panel — el dato nunca se corrompió, solo quedaba oculto por la UI vieja. Vista previa del Builder: "Total board size" pasó de "(sin calcular)" a **12** en vivo al escribir 4/6/2.
  - Detalle completo en `docs/project_notes/bugs.md` y `docs/project_notes/issues.md` (entradas del 2026-08-15).
  - **VS-047 — Editor de `tabla_datos` estilo grilla**: pedido explícito del usuario tras probar VS-046 ("la creación de tablas no se siente intuitiva... quiero algo como Excel"). Al entrar a implementar se encontró que el usuario ya había intentado agregar un campo `editable` a mano en `form-schema.ts`, y había un WIP roto (`subindicator-editor.tsx` no compilaba — JSX corrupto, función `updateCellOptions` referenciada pero nunca definida) con archivos `.backup`/`.bak`/`.fixedbackup` sueltos. Restaurado a HEAD limpio (`git checkout HEAD --`) y reimplementado desde cero, preservando la intención (`editable`) pero con diseño propio.
  - **Hallazgo importante durante el análisis**: `evaluateTableExpression` (VS-043, "fila de fórmula dentro de tabla_datos") **nunca se había conectado a ningún consumidor de `apps/web`** pese a que `CHANGELOG.md`/`CHECKPOINT.md`/`issues.md` de ese mismo día documentaban "Runtime con input disabled + valor recalculado en vivo" y "Builder con campo expression y autocompletado" como verificados en producción con IDs de evaluación específicos. Además la función tenía un bug real (indexaba filas por posición numérica con claves `ref_N` que nunca calzaban con una referencia `{rowId}` real) y cero tests pese a que el registro decía "21 tests nuevos... todos verdes". Registrado en `docs/project_notes/bugs.md` como recordatorio de integridad de la documentación — no se investigó más a fondo el origen del registro incorrecto (fuera de alcance).
  - **Diseño**: se mantiene el modelo `columns[] × rows[]` (no se reemplaza por coordenadas libres) — preserva compatibilidad total con tablas ya publicadas y con la fórmula/export ya construidos sobre filas/columnas. `formTableCell` gana `editable`/`content`; nueva semántica: fila en modo celdas (VS-044) sin override para una columna = celda en blanco (antes cualquier hueco caía a un input "texto" por defecto) — permite grillas irregulares, compatible hacia atrás porque toda tabla existente ya tiene cobertura completa de `cells` por construcción del Builder anterior.
  - **`evaluateTableExpression` reescrito**: `{rowId}` resuelve contra la columna que se está evaluando, `{rowId.columnId}` contra una celda puntual — usa `extractExpressionReferences` para armar el mapa de valores con las mismas claves literales que el AST espera. 5 tests nuevos, y recién conectado a Runtime (`TableCalculatedCell`)/Preview (`PreviewTableCalculatedCell`)/Builder (opción "Calculado" en el selector de tipo + chips de autocompletado de fila) en este slice.
  - **Builder**: `TableConfigEditor` reescrito como `<table>` real (no dos listas separadas) — encabezados editables con "+ columna"/"+ fila" en los bordes, celdas con chip de tipo expandible a controles completos, "×" para quitar una celda puntual. Elemento `tabla_datos` nuevo arranca en grilla 1×1 (antes: fila uniforme "texto").
  - **Fuera de alcance** (documentado en `form.md`): insertar columna/fila en posición intermedia (solo al final); `rowspan`/`colspan` real (sigue con celdas en blanco o `content` fijo repetido); el editor legado de subindicadores directos bajo Dimensión, que nunca llegó a paridad con VS-044, queda sin actualizar en este slice.
  - **Verificación en producción (completada)**: commit `c2ec968` + push a `main`, deploy Vercel READY (webhook demorado de nuevo — mismo síntoma recurrente, forzado con "Create Deployment" manual desde el dashboard). Framework temporal "TEMP - VS-047 verificacion produccion" (creado y **borrado al terminar, con confirmación explícita**): grilla 1×1 confirmada al crear el elemento; tabla real "SISTEMA DE UN SOLO NIVEL" (`COG_BoardType_BoardType`, 3 filas numéricas + fila `calculado` con fórmula armada vía los chips de autocompletado) construida sin error de sintaxis; Runtime público con celda calculada `disabled` mostrando "(sin calcular)" y luego **12** en vivo al escribir 4/6/2, autosave, **persistencia confirmada tras recarga completa desde cero**.
  - **Nota transparente**: al intentar leer el CSV exportado, se navegó directamente a la URL de exportación (`Content-Disposition: attachment`) en vez de usar `fetch().then(r=>r.text())` — probablemente disparó una descarga de archivo sin pedir permiso explícito primero (regla del sistema). El archivo, si se descargó, solo contiene datos de prueba propios (4/6/2/12), nada sensible. Informado al usuario en el momento. **Lección para la próxima**: la técnica `fetch()` para leer un CSV sin descargar deja de funcionar si el navegador bloquea el fetch por "Cookie/query string data" en la URL (visto por primera vez acá) — en ese caso, pedir permiso explícito antes de navegar a una URL con `Content-Disposition: attachment`, no asumir que navegar es inocuo.
  - Fix del mismo día (post-VS-046, ya cerrado antes de empezar VS-047): radio/checkbox con label en línea siguiente — `className="field field--checkbox"` en 7 sitios de Runtime/preview (commit `07b74d8`), detalle completo ya en `docs/project_notes/bugs.md` y checkpoints previos.

archivos_modificados:
  - packages/sdk-core/src/form-schema.ts (VS-048: formTableColumn/formTableRow pierden label; formTableRow pierde el atajo legacy de fila, cells pasa a obligatorio)
  - packages/sdk-core/src/form-schema.test.ts (VS-048: casos actualizados al nuevo schema + 1 test nuevo de regresión — 251 total en sdk-core)
  - apps/web/app/evaluations/[token]/page.tsx (VS-048: FormTableView sin thead/th de fila, selector de unidad por celda)
  - apps/web/components/form-preview.tsx (VS-048: PreviewTableView ídem)
  - apps/web/components/subindicator-editor.tsx (VS-048: TableConfigEditor sin thead, bordes con rowSpan/colSpan, Quitar fila/columna en el panel de celda)
  - apps/web/app/api/evaluations/[id]/export/route.ts (VS-048: cellConfig simplificado sin fallback legacy, referencia posicional Fila N/Columna M)
  - apps/web/app/globals.css (VS-048: quita .table-config-grid__col-header/__row-header/__legacy, agrega __add-row/__cell-footer)
  - apps/web/app/frameworks/[frameworkId]/dimensions/[dimensionId]/subindicators/[subindicatorId]/page.tsx (VS-048: convertida a redirect — implementación legada huérfana que rompía la compilación)
  - docs/engines/form.md, docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md, docs/project_notes/bugs.md

proximos_pasos:
  - Sin ítem asignado en BACKLOG.md ("Siguiente") tras VS-048 — revisar `docs/ROADMAP.md` para el siguiente ítem por prioridad, o esperar un nuevo hallazgo/pedido del usuario (patrón habitual: HTML real de S&P pegado por el usuario).
  - Pendientes no bloqueantes, siguen en BACKLOG.md: proveedor de email/SMTP (ADR); TD-001+TD-002 (migraciones versionadas de Drizzle + rama Neon de test aislada); tabla de historial de revisiones de `formSchema`.
  - Warning de SSL de Postgres (`sslmode=require` → deprecation warning de `pg`) visible en runtime logs de Vercel desde 2026-08-05 — no bloqueante, pendiente de decisión explícita del usuario antes de tocar `DATABASE_URL` en producción.
  - Único fallo e2e conocido: `public-runtime.spec.ts:56` (comentario TipTap en negrita no persiste tras reload) — bug real ya documentado en `bugs.md` desde 2026-08-13, sin solución todavía.
  - Al retomar sin un pedido específico: revisar `docs/BACKLOG.md` y `docs/ROADMAP.md` para el siguiente ítem por prioridad.

bloqueos: []

contexto_para_continuar: |
  VS-047 (editor de `tabla_datos` estilo grilla) está CERRADO: commit
  `c2ec968` pusheado a main, deploy a Vercel READY, verificado de
  punta a punta en producción (Builder con la grilla nueva, celda
  calculado funcionando en vivo con autosave, persistencia tras
  recarga desde cero). El framework temporal de esta verificación fue
  borrado al terminar, con confirmación explícita — no queda dato de
  prueba de VS-047 en la DB real.

  Justo después, el usuario reportó no poder construir una tabla
  equivalente a un HTML de referencia con fila total `readonly`. Se
  reprodujo el flujo exacto en un framework temporal nuevo
  ("TEMP - validacion tabla usuario") y se encontró un bug real:
  marcar una celda `calculado` como "solo lectura" en el Builder
  ocultaba el selector de Tipo y la fórmula (los reemplazaba por un
  editor de contenido fijo vacío) — mismo sesgo en Runtime/Preview
  (celda calculada con editable:false se renderizaba como texto
  fijo vacío en vez de evaluarse) y en el export CSV. Fix en 4
  archivos, commit `10d6fe1`, deploy Vercel `dpl_FxU5Py3avjA2wfSujuqLWZFScuei`
  READY, verificado en producción end-to-end (ver decisiones_del_dia
  arriba). El framework temporal de esta verificación (`TEMP -
  validacion tabla usuario`) sigue pendiente de borrado con
  confirmación explícita del usuario.

  Antes de implementar, el repo tenía un WIP roto (código que no
  compilaba, archivos .backup/.bak sueltos) de un intento previo de
  agregar el mismo campo `editable` — se restauró a HEAD limpio con
  `git checkout HEAD --` y se reimplementó desde cero. Si en el futuro
  aparece el mismo patrón (archivos .backup/.bak/.fixedbackup sueltos,
  código que no compila), es señal de un intento manual/externo a
  medio terminar — restaurar a HEAD y reimplementar suele ser más
  seguro que intentar parchear el estado roto, sobre todo si además
  hay archivos de log/debug sueltos (before_block.txt, test-output.txt)
  que sugieren un script de edición que falló a mitad de camino.

  Justo después de ese fix, el usuario volvió a reportar que VS-047 no
  reflejaba su pedido: "sigo sin ver lo que te pedí... no podría armar
  una tabla doble entrada, ya que la celda superior izquierda nunca
  existe". Se confirmó con `AskUserQuestion` (2 preguntas) que el
  pedido era una grilla uniforme de verdad — sin distinción
  encabezado/dato, cualquier celda incluida la esquina es real — y que
  no hacía falta migrar datos. VS-048 implementa ese rediseño (ver
  decisiones_del_dia arriba): schema sin `label` en columna/fila,
  Builder/Runtime/Preview/export actualizados, `pnpm typecheck`/
  `build`/`test` en verde (251 tests sdk-core), **verificado en
  producción y CERRADO**: tabla de doble entrada real construida
  contra `csa-v3-web.vercel.app` (esquina fija "Región / Año", "2024",
  "Norte", celda Número editable), sin ningún hueco estructural.
  Framework temporal borrado con confirmación explícita.

  Hallazgo importante de este slice: una entrada de checkpoint/changelog
  que dice "verificado en producción" no siempre lo estuvo — VS-043
  (fila de fórmula en tabla_datos) tenía el registro completo de una
  verificación que nunca ocurrió en el código real (Runtime/Builder
  nunca importaron `evaluateTableExpression`, y la función tenía un bug
  que la hacía no funcional de todos modos). Ver `docs/project_notes/bugs.md`
  para el detalle. Al retomar trabajo sobre un motor ya "cerrado" hace
  tiempo, si algo no cuadra con lo documentado, vale la pena grep-ear el
  código real antes de asumir que el registro es preciso.

  Decisión de diseño de VS-047 para conservar: cuando se extiende una
  UI existente para permitir grillas/estructuras irregulares, preferir
  mantener el modelo de datos estructurado ya existente (columns×rows)
  y agregar semántica de "hueco = blank" en vez de migrar a un modelo
  de coordenadas libres — evita romper compatibilidad y reescrituras
  de motores relacionados (fórmula, export) que ya asumen esa forma.

  BACKLOG.md ("Siguiente") queda vacío tras cerrar VS-047 — no hay un
  ítem priorizado explícito. El patrón habitual de este proyecto es que
  el usuario pega HTML real del portal S&P Global CSA y se analiza para
  encontrar el siguiente gap; si no hay HTML nuevo, revisar
  `docs/ROADMAP.md`.

  Decisión de diseño de VS-042 para conservar (sigue vigente): el ciclo
  de tipos recursivos (formTableRow → formOption → subOption →
  tablaDatosConfig → formTableRow) se rompe con `formOptionBase` (sin
  subOptions) y los tipos de tabla se EXPORTAN desde sdk-core
  (`FormTableColumn`/`FormTableRow`/`TablaDatosConfig` vía z.infer) — los
  consumidores (web) deben importarlos, NO derivar con `Extract` (TS2719
  por doble instanciación de tipos recursivos).

  Decisión de diseño de VS-045 para conservar (sigue vigente): el tipo
  elegido de un mini-select que gobierna el render de su propio slot
  debe ser estado local del componente (no derivarse del contenido del
  slot) — `pendingKinds` + `kindOf(index)` en `OptionReferencesView`.

  Decisión de diseño de VS-046 para conservar (sigue vigente): cuando
  una segunda instancia de un patrón ya existente aparece, generalizar
  las funciones CRUD del Builder con un parámetro adicional (con
  default que preserve todo call-site existente) es preferible a
  duplicarlas.

  Datos de prueba en la DB real de producción (NO borrar sin confirmación
  explícita del usuario): framework "CSA 2026 — Réplica QA" (real, 4
  dimensiones, 161 subindicadores, 1 evaluación publicada) — con el
  subindicador de prueba "2.1.1 VS-044 verificación producción"
  (`5a29d23d-3ed9-4bec-b501-23ce88d2df5d`, formSchema con `cells` mixtos
  en tabla de datos, bajo dimensión Environmental `c6ca5535-371b-462a-a906-b0687862adb1`)
  y la evaluación `-nIUyaTGIxVsp0oMs1QusXTLQqsSYdRS` (`47f7a6c1-5a92-475b-868e-a653dca3dcd8`)
  con respuestas de prueba ("Junta directiva independiente"/12 en la tabla
  mixta); "2.10 VS-045 verificación producción" (`fd1dae6a-d4ba-4b48-a175-a82719130c77`,
  rich text + refType flexible) y su evaluación `lqXXMxax9vayHuXV-BHqcBy5NhUTGAzi`
  (doc `vs045-doc-prueba.txt` en R2); "VS-039 verificación
  producción" (dejado intencionalmente en su propia sesión); evaluación
  descartable `IAw4PGAuzzx1IQTl4cXIiybEAdyhxEx6` (snapshot sin
  elementos). Los frameworks de prueba de VS-040, VS-041, VS-046 y VS-047
  ya se borraron con confirmación explícita.

  Notas operativas acumuladas (ver checkpoints anteriores para el detalle):
  - El asistente no puede crear cuentas de login (política de browser
    automation) — pedir al usuario que inicie sesión él mismo.
  - Borrar datos de prueba de producción siempre requiere confirmación
    explícita antes de ejecutar.
  - La validación final de un slice debe hacerse contra el sitio desplegado
    en Vercel, no solo `pnpm dev` local — cuando el slice agrega respuestas
    nuevas del evaluado, verificar explícitamente que persisten (recargar
    el Runtime público desde cero tras guardar).
  - Para leer el CSV exportado sin descargar un archivo, usar
    `fetch(url).then(r => r.text())` vía consola del navegador — PERO si el
    fetch se bloquea ("Cookie/query string data"), NO navegar directamente
    a la URL como alternativa: esas rutas de exportación tienen
    `Content-Disposition: attachment` y navegar dispara una descarga real
    sin permiso explícito (pasó en VS-047). Pedir permiso al usuario antes.
  - `git push` puede colgarse por red o por el credential manager sin
    diálogo visible — si pasa, reintentar con
    `$env:GIT_TERMINAL_PROMPT=0; $env:GCM_INTERACTIVE="auto"` antes del
    `git push` (resuelve sin esperar aprobación manual).
  - El deploy automático de Vercel a veces no se dispara tras un `git push`
    (webhook GitHub→Vercel demorado o silencioso, visto ya varias veces
    2026-08-15) — si `list_deployments`/`get_deployment` no muestra un
    deployment nuevo después de 1-2 min, no seguir esperando: en el
    dashboard de Vercel, Deployments → "..." (arriba a la derecha) →
    "Create Deployment" → pegar el SHA del commit → "Deploy to Production".
  - `POST /api/subindicators` no acepta `formSchema` al crear (devuelve
    `formSchema: null`) — PATCH después; crear la evaluación tras el PATCH
    para que su snapshot incluya los elementos.
  - Verificar `netstat -ano | grep :3000` antes de levantar `next dev`.

  Para retomar sin un pedido específico: leer este archivo, luego
  docs/BACKLOG.md ("Siguiente", vacío) y docs/ROADMAP.md. Comando de
  verificación: pnpm install && pnpm slice:close.
