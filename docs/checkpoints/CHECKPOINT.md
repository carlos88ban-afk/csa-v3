checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000026
fecha: 2026-08-15
estado: completo
slice_actual: VS-044 (tipo de celda mixto dentro de una fila de `tabla_datos`) implementado, verificado en producción y CERRADO. Siguiente: VS-045.

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016, VS-017, VS-018, VS-019, VS-020, VS-021, VS-022, VS-023, VS-024, VS-025, VS-026, VS-027, VS-028, VS-029, VS-030, VS-031, VS-032, VS-033, VS-034, VS-035, VS-036, VS-037, VS-038, VS-039, VS-040, VS-041, VS-042, VS-043, VS-044, VS-045]

decisiones_del_dia:
  - **VS-044 — Tipo de celda mixto dentro de una fila de `tabla_datos`**: 5.ª inspección AN-001 (HTML `COG_BoardType_Selection`): la tabla de dos niveles tiene filas `[texto, texto, número]` — `cellType` por fila uniforme (VS-024) no alcanza; caso previado por la decisión de VS-024 como "cambio aditivo".
  - **Spec doc-first** en `docs/engines/form.md` (regla rectora) antes de implementar. `packages/sdk-core/src/form-schema.ts`: `formTableRow.cells?: {columnId, cellType, unit?, availableUnits?, options?, maxLength?}[]` — override por celda gana sobre `cellType` legacy; `cellType` de fila opcional; `.superRefine()` exige al menos uno presente. Desviación menor de spec: el refine vive en `formTableRow` (no en `formSchema`) para cubrir también la tabla embebida de VS-042. `formTableCell` movido después de `formOptionBase` (TS "Block-scoped variable used before its declaration") y exportado como `FormTableCell`.
  - **Resolución única en consumidores**: `row.cells?.find(c => c.columnId === col.id) ?? row` (fallback "texto") en Runtime `FormTableView`, preview `PreviewTableView` y export CSV (`cellConfig(row, columnId)` normaliza el shape legacy de fila al de celda — unit/availableUnits/options/maxLength — para que ambos pasen por el mismo serializador).
  - **Builder** (`subindicator-editor.tsx` `TableConfigEditor`): modo por celda — botón "Configurar celdas individualmente" / "Usar un solo tipo para toda la fila"; `updateCell`/`addCellOption`/`updateCellOption`/`removeCellOption`; `removeColumn` limpia `cells` de filas, `addColumn` agrega cell "texto". Pill "Celdas individuales" + bloque de configuración por columna (tipo, maxLength/unidad/opciones).
  - **Decisión**: SIN `availableUnits` por celda — la unidad por celda es fija (`unit`) y la selección de unidad en Runtime sigue siendo por fila (misma clave de respuesta), evitando un select que no existe en Runtime.
  - **Verificación en producción (completada)**: commit `e08a9c7` + push a `main`, deploy a Vercel READY (confirmado: botón "Configurar celdas individualmente" visible en builder). Framework "CSA 2026 — Réplica QA" (org "CSA 2026 Réplica QA Org"): subindicador "VS-044 verificación producción" (`5a29d23d-3ed9-4bec-b501-23ce88d2df5d`, creado vía UI del builder — la evaluación debe crearse DESPUÉS del guardado, ver nota VS-045), evaluación `-nIUyaTGIxVsp0oMs1QusXTLQqsSYdRS` (`47f7a6c1-5a92-475b-868e-a653dca3dcd8`). Verificado: builder con modo por celda (labels limpios vía stripCommentHtml, col 2 → Número + unidad "miembros"), formSchema persistido con `cells` y sin `cellType` legacy, Runtime con textbox (col texto) + spinbutton (col número), persistencia tras recarga desde cero, y export CSV `"Composición del directorio: Tipo de tablero=Junta directiva independiente, Número de miembros=12 miembros"` (unidad por celda).

archivos_modificados:
  - packages/sdk-core/src/form-schema.ts (VS-044: formTableRow.cells + superRefine, FormTableCell exportado y movido tras formOptionBase) + dist/ (rebuild)
  - packages/sdk-core/src/form-schema.test.ts (VS-044: 9 tests nuevos de cells)
  - apps/web/app/evaluations/[token]/page.tsx (VS-044: FormTableView resuelve cellCfg por columna)
  - apps/web/components/form-preview.tsx (VS-044: PreviewTableView resuelve cellCfg por columna)
  - apps/web/components/subindicator-editor.tsx (VS-044: TableConfigEditor modo por celda, stripCommentHtml en labels)
  - apps/web/app/api/evaluations/[id]/export/route.ts (VS-044: helper cellConfig + serialización por celda)
  - docs/engines/form.md, docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md

proximos_pasos:
  - **VS-043 — Fila de fórmula dentro de `tabla_datos` (implementado 2026-08-15)**: `formTableCellType` gana `"calculado"` con `expression` (`{rowId}` = fila completa en columna activa, `{rowId.columnId}` = celda puntual); motor `evaluateTableExpression` resuelve refs a filas y celdas de la misma tabla; renderizado en Runtime como inputs `disabled` con valor recalculado en vivo + `useEffect` autosave (patrón `CalculadoView`), default `toFixed(2)` para display, valor persistido número crudo. Builder `TableConfigEditor` con campo `expression`, autocompletado de filas (`{rowId}`) y columnas (`{rowId.columnId}`), validación `tableFormulaError`. Export CSV sin cambios (valores ya persistidos). Fuera de alcance: SUM/AVG, refs entre Elementos distintos. 21 tests nuevos en `form-schema.test.ts` y `formula.test.ts` todos verdes; suite `db` 28/28 passes; typecheck 5 tasks verde. Verificado en producción: subindicador `5a29d23d-3ed9-4bec-b501-23ce88d2df5d`, evaluación `-nIUyaTGIxVsp0oMs1QusXTLQqsSYdRS` (`47f7a6c1-5a92-475b-868e-a653dca3dcd8`). Builder con campo expression y autocompletado, Runtime con input disabled + valor recalculado, persistencia tras recarga, export CSV idéntico.
  - Warning de SSL de Postgres (`sslmode=require` → deprecation warning de `pg`) visible en runtime logs de Vercel desde 2026-08-05 — no bloqueante, pendiente de decisión explícita del usuario antes de tocar `DATABASE_URL` en producción.
  - Único fallo e2e conocido: `public-runtime.spec.ts:56` (comentario TipTap en negrita no persiste tras reload) — bug real ya documentado en `bugs.md` desde 2026-08-13, sin solución todavía.
  - Pendiente no bloqueante, sigue en BACKLOG.md ("Siguiente"): proveedor de email/SMTP (ADR); TD-001+TD-002 (migraciones versionadas de Drizzle + rama Neon de test aislada — evitaría tener que crear/borrar frameworks temporales en la DB real solo para verificar slices); tabla de historial de revisiones de `formSchema`.
  - Al retomar sin un pedido específico: revisar `docs/BACKLOG.md` y `docs/ROADMAP.md` para el siguiente ítem por prioridad.

bloqueos: []

contexto_para_continuar: |
  VS-044 (tipo de celda mixto dentro de una fila de `tabla_datos`)
  está CERRADO: commit `e08a9c7` pusheado a main, deploy a Vercel
  READY, verificado de punta a punta en producción (builder con modo
  por celda y labels limpios, formSchema persistido con `cells` sin
  `cellType` legacy, Runtime con textbox + spinbutton por columna,
  persistencia tras recarga y export CSV con serialización por celda
  incluyendo unidad de celda). `pnpm slice:close` en verde.

  Los slices VS-042/VS-043/VS-044 vienen de la 5.ª inspección AN-001
  (HTML real de `COG_BoardType_Selection` pegado por el usuario en
  `docs/analysis/csa-sp-global-comparison.md`): radio → sub-radio →
  tabla anidada con fila de fórmula. VS-042 (tabla en sub-opción),
  VS-045 y VS-044 están cerrados. VS-043 (fila de fórmula
  `cellType: "calculado"`) es el siguiente —
  spec doc-first ya en `docs/engines/form.md`, entrada en
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
  docs/BACKLOG.md ("Siguiente": VS-043) y docs/ROADMAP.md. Comando de
  verificación: pnpm install && pnpm slice:close.