checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000026
fecha: 2026-08-15
estado: completo
slice_actual: VS-045 (formato rich text en preguntas y opciones + referencias flexibles) implementado, verificado en producción y CERRADO — incluye 2 fixes de UI hallados en la verificación. Siguiente: VS-044.

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016, VS-017, VS-018, VS-019, VS-020, VS-021, VS-022, VS-023, VS-024, VS-025, VS-026, VS-027, VS-028, VS-029, VS-030, VS-031, VS-032, VS-033, VS-034, VS-035, VS-036, VS-037, VS-038, VS-039, VS-040, VS-041, VS-042, VS-045]

decisiones_del_dia:
  - **VS-045 — Formato (rich text) en preguntas y opciones + referencias flexibles**: 6.ª inspección AN-001. El usuario pegó el HTML real de la pregunta `COG_BoardIndependence_AttachmentBoardIndependenceStatement`: el texto de la pregunta y las opciones lleva negritas y múltiples párrafos, y la fila de referencias de la opción "Sí" es `data-ref-type="flexible"` (URL pública O documento interno). Alcance confirmado con el usuario: rich text en TODAS las preguntas y opciones + referencias flexibles en el mismo slice.
  - **Spec doc-first** en `docs/engines/form.md` (regla rectora) antes de implementar. `packages/sdk-core/src/form-schema.ts`: `optionReferences` gana `refType?: "public" | "flexible"` (default `public` = VS-039, compatible hacia atrás; un solo refType por bloque como S&P). Labels siguen `z.string()` (HTML sanitizado, mismo criterio que `banner.content` de VS-038, sin migración). `packages/sdk-core/src/response.ts`: `answerValue` gana `z.array(z.union([z.string(), evidenceRef]))` — slots mixtos; los arrays legacy de strings siguen validando.
  - **Builder** (`subindicator-editor.tsx` + editor legado de subindicadores directos): todos los `<input>` de label (Elemento, opciones, sub-opciones, columnas, filas, opciones de campo) → `RichTextEditor` compartido (paste con formato nativo de TipTap, sanitizado con `sanitizeCommentHtml`). `banner.label` queda texto plano (decisión VS-038). Botones "Agregar referencias (URL)" → "Agregar referencias" (2 sitios). Bloque de referencias gana "Tipo de referencia: URL pública / Flexible".
  - **Runtime/Preview**: nuevo componente compartido `RichLabel` (renderiza labels con `dangerouslySetInnerHTML` + re-sanitización en el borde de lectura, defensa en profundidad). `OptionReferencesView` con `refType: "flexible"` muestra por slot un mini-select "URL pública / Documento interno"; modo documento = mini-flujo de adjunto a R2 reutilizando el patrón de `evidencia` (presigned upload vía nueva ruta `POST /api/public/evaluations/[token]/evidences/presign-ref` con límite server-side de 10 MB — 413 `FILE_TOO_LARGE`; solo `{key,name,size,mimeType}` en la Respuesta). Preview del Builder: slots doc en solo lectura ("Documento interno (se adjunta en la evaluación)").
  - **Export CSV**: labels serializados con `stripCommentHtml` (incluidas las celdas de tabla, 2 sitios); slots de referencia: URL literal o `[Archivo: {name}]`.
  - **Runtime flexible — limpieza de R2**: `changeKind`/`removeSlot` borran el binario previo vía `DELETE /evidences` (idempotente, anti-IDOR por prefijo); el fallo no bloquea la mutación local (el objeto huérfano se limpia con la Evaluación).
  - **BUG hallado en verificación en producción y corregido (2 commits)**: el mini-select de kind revertía a "URL pública" al cambiarlo — el `value` del select y el branch de render se derivaban del slot (`isDocRef`), pero `changeKind("doc")` vacía el slot a `null`, indistinguible de "URL aún sin texto". Fix: estado local `pendingKinds: ("url" | "doc")[]` por índice sincronizado en `changeKind`/`removeSlot`; `kindOf(index)` gobierna select y render; slot doc vacío muestra "Selecciona un archivo…". Commits `7d745c8` + `1a5fd0d`. Documentado en `docs/project_notes/bugs.md`.
  - **Nota de push**: `git push` colgado sin diálogo visible; `$env:GCM_INTERACTIVE="auto"` + `GIT_TERMINAL_PROMPT=0` lo resuelve sin esperar (el credential manager `manager` sigue activo).
  - **Verificación en producción (completada)**: commits `db22253` (VS-045 completo), `7d745c8` y `1a5fd0d` (fixes) + push a `main`, deploy a Vercel READY. Framework temporal "VS-045 verificación producción" creado (subindicador `fd1dae6a-d4ba-4b48-a175-a82719130c77` bajo dimensión Environmental del framework "CSA 2026 — Réplica QA"; NOTA: `POST /api/subindicators` NO acepta `formSchema` al crear — devuelve `formSchema: null`, hay que PATCH después y crear la evaluación DESPUÉS para que el snapshot incluya los elementos). Evaluación `lqXXMxax9vayHuXV-BHqcBy5NhUTGAzi` (la descartable `IAw4PGAuzzx1IQTl4cXIiybEAdyhxEx6` quedó con snapshot sin elementos). Verificado: (1) presign-ref responde `evaluation_NOT_FOUND` para token inválido (ruta nueva desplegada); (2) rich text renderizado en Runtime (`<strong>¿Informa</strong>` y `Sí, <em>informa</em>`); (3) flujo flexible completo — select persiste en "Documento interno", file input aparece, upload a R2 OK (descargado por URL presignada con "Ver"), Respuesta guarda `el-1::opt-a::refs` = `[{key,name,size,mimeType}]`, persiste tras recarga desde cero; (4) export CSV: label limpio (`¿Informa la empresa?`) y celda `"Sí, informa (Referencias: [Archivo: vs045-doc-prueba.txt])"`.

archivos_modificados:
  - packages/sdk-core/src/form-schema.ts (VS-045: refType en optionReferences) + dist/ (rebuild)
  - packages/sdk-core/src/response.ts (VS-045: slots mixtos en answerValue)
  - apps/web/app/evaluations/[token]/page.tsx (VS-045: RichLabel, OptionReferencesView flexible, SubOptionsView, FormTableView; fixes pendingKinds/kindOf)
  - apps/web/components/rich-label.tsx (NUEVO: RichLabel + sanitizeCommentHtml compartidos)
  - apps/web/components/subindicator-editor.tsx (VS-045: RichTextEditor en labels, selects refType, botones renombrados)
  - apps/web/components/form-preview.tsx (VS-045: PreviewOptionReferences con kinds locales, slots doc read-only)
  - apps/web/app/api/public/evaluations/[token]/evidences/presign-ref/route.ts (NUEVO: presign de refs flexibles + límite 10 MB server-side)
  - apps/web/app/api/evaluations/[id]/export/route.ts (VS-045: stripCommentHtml en celdas de tabla + refs mixtas [Archivo: nombre])
  - apps/web/app/frameworks/[frameworkId]/dimensions/[dimensionId]/subindicators/[subindicatorId]/page.tsx (editor legado: RichTextEditor)
  - apps/web/app/globals.css (.option-row__editor, .option-row__kind, .option-row .runtime-evidence)
  - docs/engines/form.md, docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/bugs.md, docs/project_notes/issues.md

proximos_pasos:
  - **VS-044 — Tipo de celda mixto dentro de una fila (siguiente)**: `formTableRow.cells?: {columnId, cellType, config...}[]` — override por celda gana sobre `cellType` legacy; `.superRefine()` exige al menos uno presente; resolución `row.cells?.find(c => c.columnId === column.id) ?? row.cellType` en Runtime/preview/export; UI por celda en `TableConfigEditor`; tests. Spec en `docs/engines/form.md`.
  - **VS-043 — Fila de fórmula dentro de `tabla_datos` (después de VS-044)**: `formTableCellType` gana `"calculado"` con `expression` (`{rowId}` = fila completa en columna activa, `{rowId.columnId}` = celda); celdas readonly recalculadas en vivo; persiste como `TableValue` con autosave (patrón `CalculadoView`); fuera de alcance SUM/AVG y refs a otros Elementos. Falta evaluador con resolver en `formula.ts` (tokenizador ya acepta `{rowId.columnId}`).
  - Warning de SSL de Postgres (`sslmode=require` → deprecation warning de `pg`) visible en runtime logs de Vercel desde 2026-08-05 — no bloqueante, pendiente de decisión explícita del usuario antes de tocar `DATABASE_URL` en producción.
  - Único fallo e2e conocido: `public-runtime.spec.ts:56` (comentario TipTap en negrita no persiste tras reload) — bug real ya documentado en `bugs.md` desde 2026-08-13, sin solución todavía.
  - Pendiente no bloqueante, sigue en BACKLOG.md ("Siguiente"): proveedor de email/SMTP (ADR); TD-001+TD-002 (migraciones versionadas de Drizzle + rama Neon de test aislada — evitaría tener que crear/borrar frameworks temporales en la DB real solo para verificar slices); tabla de historial de revisiones de `formSchema`.
  - Al retomar sin un pedido específico: revisar `docs/BACKLOG.md` y `docs/ROADMAP.md` para el siguiente ítem por prioridad.

bloqueos: []

contexto_para_continuar: |
  VS-045 (formato rich text en preguntas y opciones + referencias
  flexibles) está CERRADO: commits `db22253`, `7d745c8`, `1a5fd0d`
  pusheados a main, deploy a Vercel READY, verificado de punta a punta en
  producción (rich text en Runtime, flujo flexible URL/doc con upload a R2
  y persistencia real confirmada, export CSV con labels limpios y
  `[Archivo: nombre]`) y 2 bugs de UI hallados y corregidos en la
  verificación. `pnpm slice:close` en verde.

  Los slices VS-042/VS-043/VS-044 vienen de la 5.ª inspección AN-001
  (HTML real de `COG_BoardType_Selection` pegado por el usuario en
  `docs/analysis/csa-sp-global-comparison.md`): radio → sub-radio →
  tabla anidada con fila de fórmula. VS-042 (tabla en sub-opción) y
  VS-045 están cerrados. VS-044 (tipo de celda mixto por fila) es el
  siguiente, y VS-043 (fila de fórmula `cellType: "calculado"`) después —
  specs doc-first ya en `docs/engines/form.md`, entradas en
  `docs/BACKLOG.md`.

  Decisión de diseño importante de VS-042 para conservar: el ciclo de
  tipos recursivos (formTableRow → formOption → subOption →
  tablaDatosConfig → formTableRow) se rompe con `formOptionBase` (sin
  subOptions) y los tipos de tabla se EXPORTAN desde sdk-core
  (`FormTableColumn`/`FormTableRow`/`TablaDatosConfig` vía z.infer) — los
  consumidores (web) deben importarlos, NO derivar con `Extract` (TS2719
  por doble instanciación de tipos recursivos). `index.ts` usa `export *`,
  ya cubre los tipos.

  Decisión de diseño de VS-045 para conservar: el tipo elegido de un
  mini-select que gobierna el render de su propio slot debe ser estado
  local del componente (no derivarse del contenido del slot), porque un
  slot vacío es indistinguible entre "URL sin texto" y "doc sin subir" —
  `pendingKinds` + `kindOf(index)` en `OptionReferencesView`. El preview
  del Builder (`PreviewOptionReferences`) ya lo hacía así con `kinds`.

  Datos de prueba en la DB real de producción (NO borrar sin confirmación
  explícita del usuario): framework "CSA 2026 — Réplica QA" (real, 4
  dimensiones, 161 subindicadores, 1 evaluación publicada) — con el
  subindicador de prueba "2.10 VS-045 verificación producción"
  (`fd1dae6a-d4ba-4b48-a175-a82719130c77`, formSchema con rich text +
  refType flexible, bajo dimensión Environmental `c6ca5535-371b-462a-a906-b0687862adb1`)
  y la evaluación `lqXXMxax9vayHuXV-BHqcBy5NhUTGAzi` con respuestas de
  prueba (doc `vs045-doc-prueba.txt` en R2); "VS-039 verificación
  producción" (dejado intencionalmente en su propia sesión); evaluación
  descartable `IAw4PGAuzzx1IQTl4cXIiybEAdyhxEx6` (snapshot sin
  elementos). Los frameworks de prueba de VS-040 y VS-041 ya se borraron
  con confirmación explícita.

  Notas operativas acumuladas (ver checkpoints anteriores para el detalle):
  - El asistente no puede crear cuentas de login (política de browser
    automation) — pedir al usuario que inicie sesión él mismo.
  - Borrar datos de prueba de producción siempre requiere confirmación
    explícita antes de ejecutar.
  - La validación final de un slice debe hacerse contra el sitio desplegado
    en Vercel, no solo `pnpm dev` local — cuando el slice agrega respuestas
    nuevas del evaluado, verificar explícitamente que persisten (recargar
    el Runtime público desde cero tras guardar).
  - `git push` puede colgarse por red o por el credential manager sin
    diálogo visible — si pasa, reintentar con
    `$env:GIT_TERMINAL_PROMPT=0; $env:GCM_INTERACTIVE="auto"` antes del
    `git push` (resuelve sin esperar aprobación manual).
  - `POST /api/subindicators` no acepta `formSchema` al crear (devuelve
    `formSchema: null`) — PATCH después; crear la evaluación tras el PATCH
    para que su snapshot incluya los elementos.
  - Verificar `netstat -ano | grep :3000` antes de levantar `next dev`.

  Para retomar sin un pedido específico: leer este archivo, luego
  docs/BACKLOG.md ("Siguiente": VS-044) y docs/ROADMAP.md. Comando de
  verificación: pnpm install && pnpm slice:close.