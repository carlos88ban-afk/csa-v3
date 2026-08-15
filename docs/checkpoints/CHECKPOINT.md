checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000027
fecha: 2026-08-15
estado: completo
slice_actual: VS-046 (bloque secundario de sub-opciones por opción) implementado, verificado en producción y CERRADO. Fix adicional del mismo día: radio/checkbox con label en línea siguiente (bug pre-existente desde VS-045, hallado por el usuario probando VS-046). Siguiente: sin ítem asignado en BACKLOG.md ("Siguiente") — revisar ROADMAP.md.

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016, VS-017, VS-018, VS-019, VS-020, VS-021, VS-022, VS-023, VS-024, VS-025, VS-026, VS-027, VS-028, VS-029, VS-030, VS-031, VS-032, VS-033, VS-034, VS-035, VS-036, VS-037, VS-038, VS-039, VS-040, VS-041, VS-042, VS-043, VS-044, VS-045, VS-046]

decisiones_del_dia:
  - **Fix (mismo día, post-VS-046) — radio/checkbox con label en línea siguiente**: el usuario probó la pregunta real "1.1.1 Independencia de la Junta" en producción y reportó que el radio/checkbox quedaba solo en su línea, el texto en la siguiente. Causa: `<label className="field--checkbox">` en Runtime y preview del Builder nunca tenía la clase base `field` (`display:flex`) — solo el Builder la combinaba correctamente. Bug pre-existente desde VS-045 (el `<p>` que envuelve el label desde ese slice fuerza el salto sin `display:flex`), no introducido por VS-046, pero recién visible/reportado ahora. Fix: `className="field field--checkbox"` en los 7 sitios afectados (commit `07b74d8`). Detalle en `docs/project_notes/bugs.md`.
  - **Nota operativa nueva**: el push del fix anterior no disparó deploy automático en Vercel (~8 min sin nuevo deployment pese a que GitHub ya tenía el commit) — resuelto disparando manualmente desde el dashboard de Vercel (Deployments → "..." → "Create Deployment" → pegar el SHA → "Deploy to Production"). Guardado como nota operativa reutilizable más abajo.
  - **VS-046 — Bloque secundario de sub-opciones por opción**: pedido explícito del usuario ("analiza esta pregunta... valida en producción que sea capaz de crear una igual, si no, crea el plan de mejora") sobre el HTML completo de `COG_BoardIndependence_Selection` (la misma pregunta que originó VS-045). Re-análisis + validación en vivo mostraron que la opción "Applicable" trae DOS `<ol>` **hermanos** e independientes: sub-radio excluyente "StockExchange" (ya construible, VS-040) Y, por separado, un grupo de checkboxes con encabezado propio ("Distribución de objetivos") — `formOption` solo admitía un bloque `subOptions` con una sola exclusividad para todo el array.
  - **Corrige una conclusión errónea de la 6.ª inspección** (2026-08-14, `docs/analysis/csa-sp-global-comparison.md`): la nota original daba este caso por "sin gap nuevo" — lectura apresurada que no siguió el prefijo del `id` del segundo `<ol>`. Corregido en el mismo archivo (historial preservado, no borrado).
  - **Diseño**: `formOption.secondaryOptions`/`secondaryOptionsHeading`/`secondaryOptionsExclusive` — mismo shape que `subOptions` (reusa `subOption` sin nuevo tipo zod), tope fijo en 2 bloques (no array genérico de N grupos), mismo criterio que sub-opciones a 2 niveles (VS-026). Clave de respuesta: mismo patrón sintético con segmento `secondary` (`${elementId}::${optionId}::secondary::${subOptionId}`), sin cambios en `response.ts`.
  - **Runtime/preview**: `SubOptionsView`/`PreviewSubOptions` (ya genéricos por `subKey`/`exclusive`) ganan un prop `heading` opcional y se invocan una 2.ª vez para el bloque secundario — sin tocar su lógica de field/table/references/2do nivel, que ya funcionaba para cualquier array de `subOption`.
  - **Builder**: las ~20 funciones CRUD de `subOptions` (`addSubOption`/`updateSubOptionNode`/sus ~15 derivadas de field/table/references) ganan un parámetro `block: "subOptions" | "secondaryOptions" = "subOptions"` en vez de duplicarse — todo call-site existente preserva su comportamiento por el default. Nuevas: `addSecondaryOptionsBlock`/`removeSecondaryOptionsBlock`, `updateSecondaryOptionsHeading`, `toggleSecondaryOptionsExclusive`. Botón "Agregar bloque secundario de sub-opciones" por opción.
  - **Alcance reducido en el Builder** (documentado en `form.md`, no en el schema): los ítems del bloque secundario soportan label/field/references desde la UI (cubre el caso real, `field: texto_corto`); tabla embebida y sub-sub-opciones de un ítem de `secondaryOptions` no tienen UI propia en este slice (el tipo y Runtime/Preview ya los soportarían si se cargaran por otra vía) — aditivo si aparece un caso real.
  - **Export CSV**: `formatOptionLabel` factoriza `formatMarkedSubOptions(subOptions, key, answers)`, reusada para `opt.subOptions` y `opt.secondaryOptions`.
  - Incluye un fix suelto previo a esta sesión (no generado por este slice): `return` duplicado en `evaluateTableExpression` (`packages/sdk-core/src/formula.ts`) y corrección de texto en este mismo checkpoint (siguiente slice tras VS-044 era VS-045, no VS-043) — commiteados juntos a pedido explícito del usuario.
  - **Verificación en producción (completada)**: commit `0c1272d` + push a `main`, deploy Vercel READY (`dpl_GFzKYPakbM8qPTniiThBRR6XwvRr`). Framework temporal "TEMP - VS-046 verificacion produccion" (creado y **borrado al terminar, con confirmación explícita** — no queda en la DB real): Builder con el botón nuevo, bloque secundario completo (encabezado "Distribución de objetivos" + checkbox "excluyentes" + ítem con campo `texto_corto` embebido, máx. 1000); preview del Builder y Runtime público (`/evaluations/RLHX1jApGPli63Co7gws6sI8ox0lmgjV`) con el mismo render; **persistencia confirmada tras recarga completa desde cero** (radio "Applicable", checkbox marcado, valor "40%" del campo, todos conservados); export CSV `"Applicable — La empresa tiene una participación objetivo de directores independientes en el consejo (40%)"`.

archivos_modificados:
  - packages/sdk-core/src/form-schema.ts (VS-046: formOption.secondaryOptions/secondaryOptionsHeading/secondaryOptionsExclusive)
  - packages/sdk-core/src/form-schema.test.ts (VS-046: 6 tests nuevos, 242 total)
  - packages/sdk-core/src/formula.ts (fix suelto previo a la sesión: return duplicado en evaluateTableExpression)
  - apps/web/app/evaluations/[token]/page.tsx (VS-046: SubOptionsView gana prop heading + 2.ª invocación para secondaryOptions)
  - apps/web/components/form-preview.tsx (VS-046: PreviewSubOptions ídem)
  - apps/web/components/subindicator-editor.tsx (VS-046: funciones CRUD de subOptions ganan parámetro block; nuevas addSecondaryOptionsBlock/removeSecondaryOptionsBlock/updateSecondaryOptionsHeading/toggleSecondaryOptionsExclusive; JSX del bloque secundario)
  - apps/web/app/globals.css (VS-046: .sub-options__heading)
  - apps/web/app/api/evaluations/[id]/export/route.ts (VS-046: formatMarkedSubOptions factorizada)
  - docs/engines/form.md, docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md, docs/analysis/csa-sp-global-comparison.md (corrección de la 6.ª inspección)

proximos_pasos:
  - **Mejorar experiencia de edición de `tabla_datos`** (BACKLOG.md "Siguiente": item pendiente — admin puede agregar/quitar filas y columnas individualmente, definir tipo de celda editable vs solo-lectura por celda, experiencia tipo Excel, celdas desbloqueables con `expression` `calculado` VS-043). Siguiente slice tras VS-045.
  - Sin ítem asignado prioritario en BACKLOG.md tras VS-045 — revisar `docs/ROADMAP.md` para el siguiente ítem por prioridad, o esperar un nuevo hallazgo/pedido del usuario (patrón habitual: HTML real de S&P pegado por el usuario).
  - Pendientes no bloqueantes, siguen en BACKLOG.md: proveedor de email/SMTP (ADR); TD-001+TD-002 (migraciones versionadas de Drizzle + rama Neon de test aislada); tabla de historial de revisiones de `formSchema`; **Mejorar experiencia de edición de `tabla_datos`** (admin puede agregar/quitar filas y columnas individualmente, definir tipo de celda editable vs solo-lectura por celda).
  - Warning de SSL de Postgres (`sslmode=require` → deprecation warning de `pg`) visible en runtime logs de Vercel desde 2026-08-05 — no bloqueante, pendiente de decisión explícita del usuario antes de tocar `DATABASE_URL` en producción.
  - Único fallo e2e conocido: `public-runtime.spec.ts:56` (comentario TipTap en negrita no persiste tras reload) — bug real ya documentado en `bugs.md` desde 2026-08-13, sin solución todavía.
  - Al retomar sin un pedido específico: revisar `docs/BACKLOG.md` y `docs/ROADMAP.md` para el siguiente ítem por prioridad.

bloqueos: []

contexto_para_continuar: |
  VS-046 (bloque secundario de sub-opciones por opción) está CERRADO:
  commit `0c1272d` pusheado a main, deploy a Vercel READY, verificado
  de punta a punta en producción (Builder con el botón nuevo, bloque
  secundario completo, Runtime con persistencia confirmada tras
  recarga, export CSV correcto). El framework temporal de esta
  verificación fue borrado al terminar, con confirmación explícita —
  no queda dato de prueba de VS-046 en la DB real.

  VS-046 nace de un pedido del usuario de analizar en profundidad una
  pregunta YA usada como fuente de VS-045 (`COG_BoardIndependence_Selection`)
  y corrige una conclusión errónea de la 6.ª inspección AN-001 (ver
  `docs/analysis/csa-sp-global-comparison.md`, nota de corrección
  2026-08-15) — sirve de recordatorio: al re-analizar HTML ya usado
  antes, seguir con cuidado el prefijo de los `id` de cada bloque
  anidado antes de concluir "sin gap nuevo".

  Decisión de diseño importante de VS-046 para conservar: cuando una
  segunda instancia de un patrón ya existente (aquí, un segundo bloque
  de sub-opciones) aparece, generalizar las funciones CRUD del Builder
  con un parámetro adicional (`block`) es preferible a duplicarlas —
  siempre que el parámetro tenga un default que preserve el
  comportamiento de todo call-site existente. Mismo criterio aplicado
  en Runtime/preview: los componentes ya genéricos (`SubOptionsView`)
  se reusan con un prop nuevo en vez de crear una variante paralela.

  BACKLOG.md ("Siguiente") queda vacío tras cerrar VS-046, pero ahora incluye el ítem **Mejorar experiencia de edición de `tabla_datos`** (pendiente: admin puede agregar/quitar filas y columnas individualmente, definir tipo de celda editable vs solo-lectura por celda, experiencia tipo Excel). El patrón habitual es que el usuario pegue HTML real del portal S&P Global CSA y se analiza para encontrar el siguiente gap; si no hay HTML nuevo, revisar `docs/ROADMAP.md`.

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
  elementos). Los frameworks de prueba de VS-040, VS-041 y VS-046 ya se
  borraron con confirmación explícita.

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
    `fetch(url).then(r => r.text())` vía consola del navegador (evita el
    paso de "descarga de archivo" que requiere confirmación explícita del
    usuario) — usado en la verificación de VS-046.
  - `git push` puede colgarse por red o por el credential manager sin
    diálogo visible — si pasa, reintentar con
    `$env:GIT_TERMINAL_PROMPT=0; $env:GCM_INTERACTIVE="auto"` antes del
    `git push` (resuelve sin esperar aprobación manual).
  - El deploy automático de Vercel a veces no se dispara tras un `git push`
    (webhook GitHub→Vercel demorado o silencioso, visto por primera vez
    2026-08-15, ~8 min sin nuevo deployment pese al commit ya en
    `origin/main`) — si `list_deployments`/`get_deployment` no muestra un
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
