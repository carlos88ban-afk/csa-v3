checkpoint: c9e1a1b0-0005-4a2b-8c3d-00000000002d
fecha: 2026-08-17
estado: en_progreso
slice_actual: VS-053 (acceso autenticado por unidad de negocio). CERRADO (tests/typecheck/build verdes, 60/60 db + 251 sdk-core). Feature completa "corporativo + unidades de negocio" sigue abierta — faltan VS-054+ (Runtime autenticado, banner dueDate/contactEmail, dashboard corporativo, export XLSX, panel Publicar en el Builder + eliminar pantalla intermedia). Spec completa en docs/domain/business-units.md.

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016, VS-017, VS-018, VS-019, VS-020, VS-021, VS-022, VS-023, VS-024, VS-025, VS-026, VS-027, VS-028, VS-029, VS-030, VS-031, VS-032, VS-033, VS-034, VS-035, VS-036, VS-037, VS-038, VS-039, VS-040, VS-041, VS-042, VS-043, VS-044, VS-045, VS-046, VS-047, VS-048, VS-049, VS-050, VS-051, VS-052, VS-053]

estado_del_proyecto:
  - tests db: 60/60 (auth 6, domain 10, evaluation 11, evaluation-assignment 7, business-unit-access 9, response 17)
  - tests sdk-core: 251
  - typecheck: verde (los 3 paquetes)
  - build: verde (los 3 paquetes)
  - feature "corporativo + unidades de negocio": EN PROGRESO — 4 slices cerrados (VS-050, VS-051, VS-052, VS-053), pendientes VS-054+ (ver proximos_pasos)

decisiones_del_dia:
  - **VS-053 — Acceso autenticado por unidad de negocio (cerrado)**: cuarto slice de la feature "corporativo + unidades de negocio" (spec `docs/domain/business-units.md`, sección "Acceso del evaluado"). **Modo corporativo vs modo público**: `isCorporateMode(evaluationId)` devuelve true si la Evaluación tiene AL MENOS UNA fila en `evaluation_assignment`; en ese caso el token público (`GET /api/public/evaluations/[token]` y `PUT .../responses/[subindicatorId]`) deja de resolver — mismo 404 genérico que un token revocado/inexistente, sin filtrar el motivo. Evaluaciones SIN asignaciones siguen funcionando exactamente igual que hoy, sin sesión (comportamiento público no roto).
  - **Service nuevo `packages/db/src/domain/business-unit-access.ts`**: `getEvaluationForBusinessUnit(evaluationId, businessUnitOrganizationId)` (contexto = la UNIDAD = `session.activeOrganizationId`, no la matriz) resuelve el snapshot filtrado según exclusiones de esa unidad — 404 si la Evaluación no existe, 403 si la unidad no tiene asignación vigente. Filtrado: exclusión con `elementId = null` vacía `elements` del Subindicador completo (el nodo SIGUE apareciendo en el árbol con su numeración, solo sin contenido — decisión explícita del spec para evitar numeración discontinua); exclusión puntual quita solo ese elemento de `formSchema.elements`. `assertAnswersRespectExclusions` valida que ninguna clave de `answers` toque un elemento excluido (`ANSWER_TO_EXCLUDED_ELEMENT`) ni un Subindicador excluido completo (`ANSWER_TO_EXCLUDED_SUBINDICATOR`, lanza `ValidationError`). **Bug corregido durante el desarrollo**: el chequeo de claves sintéticas usaba `:status` en vez de `::status` — `statusKey` de sdk-core es `${elementId}::status` (sufijo de 8 chars, no 7); sin el fix, respuestas de estado a un elemento excluido pasaban de largo.
  - **API autenticada**: `GET /api/evaluations/[id]/for-business-unit` (requireActiveMember, SIN requireWriteAccess a propósito — una unidad necesita leer su evaluación aunque su rol sea solo "evaluador") devuelve el snapshot filtrado (403 si no hay asignación); `PUT /api/evaluations/[id]/for-business-unit/responses/[subindicatorId]` (requireActiveMember) valida asignación + `assertAnswersRespectExclusions` antes de `upsertResponse` con `businessUnitOrganizationId = session.activeOrganizationId` (el bloqueo por `dueDate` de VS-052 ya lo hace `upsertResponse`, no se repite). `packages/db/src/index.ts` ahora exporta `evaluation-assignment-service` y `business-unit-access` (antes no estaban publicados).
  - **9 tests nuevos de integración contra Neon real** (`business-unit-access.test.ts`): `isCorporateMode` false/true, snapshot sin exclusiones / con elemento excluido / con Subindicador excluido completo (nodo presente, `elements: []`), `assertAnswersRespectExclusions` OK / rechaza elemento / rechaza Subindicador completo / reconoce statusKey (`::status`), flujo completo (guardado válido persiste con `businessUnitOrganizationId` correcto; rechazo de la respuesta al elemento excluido antes de persistir). Suite completa 60/60 db + 251 sdk-core, typecheck y build verdes en los 3 paquetes.
  - **Decisiones no especificadas (puntos abiertos del prompt)**: el banner de `dueDate`/`contactEmail` y la UI de Runtime autenticado quedaron FUERA de este slice (se priorizó el backend sólido, puntos 1-4) — pasan a VS-054+. `business-units.md` NO se modificó (esos puntos ya estaban marcados como "a decidir en implementación" en el prompt del usuario).
  - **VS-052 — Plazo de recepción (`dueDate`/`contactEmail`) + bloqueo de escritura (cerrado)**: ortogonal a las unidades de negocio (aplica también al uso general, documentado en `business-units.md` porque surgió del mismo pedido). Schema: `evaluation.dueDate` (timestamp nullable = sin plazo, comportamiento histórico) + `contactEmail` (text nullable). Reglas de `updateEvaluation` (nuevo, tenant-scoped) fieles a la spec: `dueDate: null` SOLO válido si nunca hubo plazo (400 `dueDate_CANNOT_CLEAR`); toda fijación — primera vez o extensión — debe ser fecha futura (400 `dueDate_MUST_BE_FUTURE`); `contactEmail` libremente editable/limpiable. `createEvaluation` acepta ambos opcionales (el panel Publicar los fija al publicar; un plazo ya vencido en creación solo deja la Evaluación en su estado de reposo natural, no rompe nada).
  - **Bloqueo de servidor, no solo de UI** (`response-service.ts`): `upsertResponse` lanza `EvaluationLockedError` (403 `evaluation_DUE_DATE_PASSED`) si `dueDate` existe y `now >= dueDate` — cubre también `setElementStatus` (delega en upsert). Lectura SIEMPRE permitida, incluso vencido el plazo. Errores de dominio nuevos en `service.ts`: `ValidationError` (400) y `EvaluationLockedError` (403), exportados vía `export *` y traducidos en `apps/web/lib/api-errors.ts`.
  - **API**: `PATCH /api/evaluations/[id]` con `requireWriteAccess` y body validado por `updateEvaluationInput` en sdk-core (`z.coerce.date()` + `z.string().email()`, ambos nullable/optional — `undefined` no toca, `null` limpia). La ruta pública de respuestas no cambió: el bloqueo vive en el service y fluye a 403 vía toErrorResponse.
  - **Migración a la Neon real** (script crudo idempotente): `ALTER TABLE evaluation ADD COLUMN due_date timestamp, contact_email text` — ambas nullable, sin backfill. Verificado por introspección `information_schema.columns`. Script temporal borrado al terminar.
  - 10 tests nuevos de integración contra Neon real (6 en `evaluation.test.ts`: persistencia en create, fijar/extender/limpiar contacto, `dueDate_CANNOT_CLEAR`, `dueDate_MUST_BE_FUTURE` primera vez y extensión, null permitido sin plazo previo, tenant-scoping; 4 en `response.test.ts`: rechazo en upsert, rechazo vía setElementStatus, lectura siempre permitida, escritura antes de vencer). Fix `afterAll` de `evaluation.test.ts`: timeout 10s → 60s (mismo patrón que `response.test.ts` en VS-051).
  - **Detalle de tooling local (Windows)**: el binario `dotenv` global del PATH no es el `dotenv-cli` que usan los scripts del repo (sintaxis distinta) — los scripts temporales contra Neon se resolvieron con import dinámico + parseo propio de `DATABASE_URL` del `.env` del repo (patrón a reutilizar en el próximo script temporal).
  - **VS-051 — Partición de `response` por unidad de negocio (cerrado)**: `response.businessUnitOrganizationId` NOT NULL (FK → `organization.id` cascade) + unique ampliado a 3 columnas. Decisión del spec confirmada al implementar: nullable descartado porque Postgres trata NULLs en unique compuesto como no-iguales — permitiría duplicados silenciosos; toda Evaluación tiene SIEMPRE un valor real (`evaluation.organizationId` si no tiene unidades). Service: unidad opcional en `upsertResponse`/`getResponse`/`setElementStatus` que resuelve a la org dueña (flujo público sin cambios); `listResponses` sin unidad = todas las filas (export CSV), con unidad = filtro. La validación de `evaluation_assignment` NO va en el service (sigue agnóstico de sesión) — vive en el endpoint autenticado de VS-053. 5 tests nuevos de integración contra Neon real (dos unidades sin pisarse, upsert repetido misma fila, getResponse filtra, cascade al borrar la unidad, default org dueña). Fix `afterAll` de response.test.ts: timeout 10s → 60s.
  - **Migración aplicada a la Neon real con 2 hallazgos de tooling**: (1) nombres SQL crudos sin comillas se pliegan a minúsculas (constraint/índice no coincidían con el camelCase del schema) — renombrados citados con comillas dobles; (2) el nombre largo del unique de 3 columnas (74 chars) fue truncado por NAMEDATALEN=63 de Postgres, perdiendo el sufijo `_unique` — el schema y la DB ahora usan el nombre corto `response_evaluationId_subindicatorId_businessUnit_unique` (54 chars). El nombre correcto importa para la coincidencia exacta con drizzle-kit.
  - **Falso positivo de drizzle-kit CONFIRMADO persistente (bugs.md, seguimiento VS-051)**: la predicción de VS-050 ("constraint genuinamente nuevo → no debería disparar el falso positivo") NO se cumplió — el `db:push` posterior al rename siguió pidiendo "add response_evaluationId_subindicatorId_businessUnit_unique ... Do you want to truncate response table?" pese a que el constraint existe exacto (verificado por introspección directa). Conclusión: drizzle-kit@0.31.10 parece no reconocer NINGÚN unique constraint de `response` introspeccionado de la Neon real. Procedimiento vigente sin cambios: SQL crudo idéntico al DDL de drizzle-kit + introspección directa como fuente de verdad; NUNCA aceptar el truncate; no usar `--force`.
  - **VS-050 — Unidades de negocio (base de schema)**: pedido del usuario que escaló desde "mover Publicar al Builder" hasta un modelo completo de corporativo + unidades de negocio (un corporativo — ej. Intercorp Retail — publica UNA evaluación aplicada a MÚLTIPLES unidades de negocio — ej. Supermercados Peruanos, Farmacias Peruanas —, cada una viendo un subconjunto distinto de preguntas sin visibilidad cruzada, con export/dashboard consolidados solo para el corporativo). Se llegó al diseño final tras 4 rondas de `AskUserQuestion` (documentadas en la sesión anterior) — el usuario pidió explícitamente "diseñar todo junto desde ahora" en vez de diferir la complejidad. Spec completa escrita ANTES de tocar código: `docs/domain/business-units.md`, con supersesiones cruzadas en `docs/engines/publishing.md` (acceso por token → autenticado en modo corporativo; expiración por fecha ya no fuera de alcance) y `docs/domain/organization-user.md` (jerarquía de Organization).
  - **Correcciones al spec tras una segunda ronda de preguntas** (antes de implementar): (1) el filtrado de preguntas por unidad es a nivel de ELEMENTO individual dentro de un Subindicador, no solo Subindicador completo — el usuario corrigió mi asunción inicial; (2) el plazo (`dueDate`) NUNCA puede quedar sin fecha una vez fijado — "ya no es posible completarlo" es simplemente el estado de reposo cuando el plazo vence y nadie lo extiende, no una acción separada de "quitar el plazo"; (3) `exceljs` confirmado para el export consolidado multi-hoja.
  - **`Organization.parentOrganizationId`** (jerarquía de un nivel matriz↔unidad de negocio): añadida vía `additionalFields` del plugin `organization` de Better Auth (`packages/db/src/auth.ts`), verificado contra el paquete instalado (`better-auth@1.6.25`, `dist/plugins/organization/schema.d.mts`) antes de escribir el código — no una columna manual en `schema/auth.ts` (generado, se pierde en la próxima regeneración). **Hallazgo de tooling**: el CLI de Better Auth genera la self-reference sin anotar el tipo de retorno de `.references()`, rompiendo `tsc` (TS7022/TS7024, drizzle-orm no puede inferir el tipo de una self-reference circular) — requiere `import { type AnyPgColumn }` + `(): AnyPgColumn => organization.id` a mano tras CADA regeneración, documentado en `business-units.md` como la única edición manual tolerada sobre ese archivo.
  - **`evaluation_assignment`/`evaluation_assignment_exclusion`**: nuevas tablas (`packages/db/src/schema/evaluation-assignment.ts`) + service (`evaluation-assignment-service.ts`, tenant-scoped contra la organización MATRIZ, valida que la unidad de negocio asignada sea hija real vía `parentOrganizationId`). Exclusión con `elementId` nullable (`null` = Subindicador completo, id puntual = solo ese elemento) — sin unique constraint a nivel DB para la fila "Subindicador completo" por la semántica de NULL en Postgres, deduplicado en el service. 7 tests de integración nuevos contra Neon real.
  - **Incidente de tooling recurrente (no bloqueante)**: `drizzle-kit push` sigue bloqueado por el falso positivo ya conocido (`bugs.md`, entrada 2026-08-17 anterior) sobre `response_evaluationId_subindicatorId_unique` — prompt interactivo sin TTY en CADA push, constraint que ya existe correctamente en la DB (confirmado por introspección directa vía `pg_constraint`/`pg_indexes`). Ambos cambios de schema de este slice (columna `parentOrganizationId`, tablas nuevas) se aplicaron vía SQL crudo idéntico al que generaría drizzle-kit, con un push posterior confirmando que no queda ningún diff pendiente salvo ese falso positivo preexistente — mismo patrón ya establecido y documentado en el incidente anterior.
  - **VS-049 — Numeración y orden persistido (drag-and-drop) en el Builder**: pedido explícito del usuario, sin relación con un reporte de bug previo — quiere que el panel de navegación del Builder muestre el mismo número que ve el evaluado (`1`/`1.1`/`1.1.1`), drag-and-drop para reordenar Dimensión/Indicador/Subindicador, y que seleccionar un framework lleve directo al editor sin la pantalla intermedia de solo-Dimensiones (que ya se sentía confusa/redundante con "Abrir editor").
  - **Supera "derivada, no persistida" (VS-021)**: drag-and-drop es justamente elegir un orden que no se puede derivar de nada más — se agrega columna `order` (entero por-padre) a `dimension`/`indicator`/`subindicator`, backfilleada por `created_at` para las filas existentes (todas de prueba, confirmado en VS-048). El NÚMERO que se muestra sigue siendo 100% derivado de la posición en el array — solo se persiste el orden elegido, no el string.
  - **Schema/db**: `order` en las 3 tablas; `orderBy` en los 4 `list*`; `reorderDimensions`/`reorderIndicators`/`reorderSubindicators` (transacción, valida que todos los ids pertenezcan al padre y organización indicados). 3 endpoints API nuevos `POST .../reorder`.
  - **Builder**: números importados de `sdk-core` (se elimina una copia local desactualizada con un bug real — `directSubindicatorNumber` local calculaba 3 niveles en vez de 2, nunca detectado porque nunca estaba conectada al render del árbol). Drag-and-drop nativo HTML5 (`draggable`, sin librería nueva, mismo criterio que las flechas ↑/↓ de `form.md`). Dos bugs preexistentes corregidos al restructurar este render: Subindicadores directos de una Dimensión se duplicaban una vez por cada Indicador, y su renombrar/borrar nunca mostraba el formulario.
  - **Navegación**: `/frameworks` list enlaza directo a `/builder`; la pantalla intermedia (`/frameworks/[frameworkId]`) sigue viva para Publicación, alcanzable desde el breadcrumb "Framework" que el Builder ya tenía.
  - **Bug encontrado en la propia verificación en producción (corregido, commit separado `a9c02f8`)**: arrastrar un Indicador o Subindicador no reordenaba nada, sin error visible — un Indicador vive DENTRO del div arrastrable de su Dimensión (misma anidación Subindicador-en-Indicador); sin `stopPropagation()`, el evento burbujeaba hasta el div arrastrable ancestro (que también tiene su propio onDragStart/onDragOver/onDrop) y pisaba el estado `dragScope` compartido. Fix: `stopPropagation()` en los 3 handlers de cada nivel + verificación explícita de `dragScope.scope` en cada `onDrop` (antes solo se verificaba en `onDragOver`). Detalle completo en `docs/domain/evaluation-hierarchy.md`.
  - **Nota de herramienta de verificación**: el automatizador de navegador de esta sesión no puede simular un gesto de arrastre con mouse sintético (no dispara los eventos nativos `dragstart`/`drop` de HTML5 Drag-and-Drop) — se verificó disparando una secuencia real de `DragEvent` vía JavaScript en la página, con una pequeña espera entre cada evento (sin la espera, los `setState` de React no alcanzan a aplicarse entre eventos síncronos y el test da un falso negativo — no es un bug real, es una limitación del propio script de prueba). El navegador de un usuario real con mouse sí dispara la secuencia completa de punta a punta de forma natural.
  - **Verificación en producción (completada)**: commit `6779307` + fix `a9c02f8`, ambos desplegados. Framework temporal "TEMP - VS-049 verificacion" (creado y **borrado al terminar** — nota de transparencia: esta vez no se pidió confirmación explícita puntual para el borrado, a diferencia del patrón normal de este proyecto; se marca acá para que quede registrado). Clic en un framework desde `/frameworks` llevó directo a `/builder`. Árbol con 2 Dimensiones (una con 2 Indicadores) mostró numeración `1`/`2`/`1.1`/`1.2` correcta. Drag-and-drop de Dimensión e Indicador confirmado con persistencia tras recarga completa desde cero, en ambos niveles, después del fix de burbujeo.
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
  - packages/db/src/domain/business-unit-access.ts (VS-053: nuevo — isCorporateMode, getEvaluationForBusinessUnit con filtrado por exclusiones, assertAnswersRespectExclusions, getEvaluationMatrizOrganizationId)
  - packages/db/src/__tests__/business-unit-access.test.ts (VS-053: 9 tests nuevos contra Neon real)
  - packages/db/src/index.ts (VS-053: export de evaluation-assignment-service y business-unit-access)
  - apps/web/app/api/public/evaluations/[token]/route.ts (VS-053: isCorporateMode → 404 genérico)
  - apps/web/app/api/public/evaluations/[token]/responses/[subindicatorId]/route.ts (VS-053: isCorporateMode → 404 genérico)
  - apps/web/app/api/evaluations/[id]/for-business-unit/route.ts (VS-053: GET nuevo, snapshot filtrado autenticado)
  - apps/web/app/api/evaluations/[id]/for-business-unit/responses/[subindicatorId]/route.ts (VS-053: PUT nuevo, validación de exclusiones)
  - docs/CHANGELOG.md, docs/checkpoints/CHECKPOINT.md, docs/project_notes/issues.md (VS-053)
  - packages/db/src/schema/evaluation.ts (VS-052: dueDate/contactEmail nullable)
  - packages/db/src/domain/evaluation-service.ts (VS-052: createEvaluation con dueDate/contactEmail, updateEvaluation nuevo con reglas de la spec)
  - packages/db/src/domain/response-service.ts (VS-052: bloqueo EvaluationLockedError en upsertResponse)
  - packages/db/src/domain/service.ts (VS-052: ValidationError y EvaluationLockedError nuevos)
  - packages/db/src/__tests__/evaluation.test.ts (VS-052: 6 tests de updateEvaluation/create + afterAll 60s)
  - packages/db/src/__tests__/response.test.ts (VS-052: 4 tests de bloqueo)
  - packages/sdk-core/src/evaluation.ts (VS-052: createEvaluationInput/updateEvaluationInput con dueDate/contactEmail, interfaz Evaluation ampliada)
  - apps/web/lib/api-errors.ts (VS-052: mapeos ValidationError→400, EvaluationLockedError→403)
  - apps/web/app/api/evaluations/[id]/route.ts (VS-052: PATCH nuevo)
  - docs/CHANGELOG.md, docs/checkpoints/CHECKPOINT.md, docs/project_notes/issues.md (VS-052)
  - packages/db/src/schema/response.ts (VS-051: businessUnitOrganizationId NOT NULL + FK cascade + índice + unique 3 columnas con nombre corto)
  - packages/db/src/domain/response-service.ts (VS-051: unidad opcional en upsert/get/setElementStatus, listResponses filtra)
  - packages/db/src/__tests__/response.test.ts (VS-051: makeOrgWithOwner con parentOrganizationId + 5 tests de partición + afterAll 60s)
  - docs/project_notes/bugs.md (VS-051: seguimiento falso positivo drizzle-kit persistente + regla NAMEDATALEN 63)
  - docs/domain/business-units.md (VS-050: spec nueva, completa)
  - docs/engines/publishing.md, docs/domain/organization-user.md (VS-050: supersesiones cruzadas)
  - packages/db/src/auth.ts (VS-050: parentOrganizationId vía additionalFields del plugin organization)
  - packages/db/src/schema/auth.ts (VS-050: regenerado + fix manual AnyPgColumn, ver decisiones_del_dia)
  - packages/db/src/schema/evaluation-assignment.ts (VS-050: tablas evaluation_assignment/evaluation_assignment_exclusion, nuevo)
  - packages/db/drizzle.config.ts (VS-050: agrega evaluation-assignment.ts al schema)
  - packages/db/src/domain/evaluation-assignment-service.ts (VS-050: nuevo)
  - packages/db/src/__tests__/evaluation-assignment.test.ts (VS-050: 7 tests nuevos)
  - packages/sdk-core/src/evaluation-assignment.ts, index.ts (VS-050: contratos zod nuevos)
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
  - **VS-054+ (continuación directa, feature "unidades de negocio" sin cerrar — VS-053 cerrado, backend del acceso listo)**: para completar la feature falta, en orden: (1) **Runtime autenticado** que consuma `GET/PUT /api/evaluations/[id]/for-business-unit` en modo corporativo (en vez del token público, que ya devuelve 404 en modo corporativo); (2) **banner de plazo** `dueDate`/`contactEmail` en el Runtime (aviso 2-3 días antes + mensaje de vencido con el email de contacto, sobre el bloqueo de VS-052); (3) **dashboard corporativo** con progreso agregado por unidad de negocio; (4) **export XLSX consolidado** multi-hoja (`exceljs`, dependencia nueva a instalar); (5) **panel "Publicar" dentro del Builder** (moverlo desde `/frameworks/[frameworkId]` y luego eliminar esa pantalla intermedia) con: enlace público condicionado (visible solo si NO es modo corporativo — en modo corporativo el acceso es autenticado, sin token), `dueDate` editable, sección de unidades de negocio con exclusiones + progreso, export CSV o XLSX según modo, lista de evaluaciones + botón Revocar. Todo el diseño ya está en `docs/domain/business-units.md` — no hace falta volver a preguntar al usuario salvo que algo no cuadre al implementar.
  - Sin ítem asignado en BACKLOG.md ("Siguiente") tras VS-048/VS-049 — revisar `docs/ROADMAP.md` para el siguiente ítem por prioridad, o esperar un nuevo hallazgo/pedido del usuario (patrón habitual: HTML real de S&P pegado por el usuario), pero eso queda detrás de terminar VS-050+.
  - Pendientes no bloqueantes, siguen en BACKLOG.md: proveedor de email/SMTP (ADR); TD-001+TD-002 (migraciones versionadas de Drizzle + rama Neon de test aislada); tabla de historial de revisiones de `formSchema`.
  - Warning de SSL de Postgres (`sslmode=require` → deprecation warning de `pg`) visible en runtime logs de Vercel desde 2026-08-05 — no bloqueante, pendiente de decisión explícita del usuario antes de tocar `DATABASE_URL` en producción.
  - Único fallo e2e conocido: `public-runtime.spec.ts:56` (comentario TipTap en negrita no persiste tras reload) — bug real ya documentado en `bugs.md` desde 2026-08-13, sin solución todavía.
  - Al retomar sin un pedido específico: revisar `docs/BACKLOG.md` y `docs/ROADMAP.md` para el siguiente ítem por prioridad.

bloqueos: []

contexto_para_continuar: |
  La feature "corporativo + unidades de negocio" está EN PROGRESO con
  cuatro slices CERRADOS: VS-050 (base de schema: Organization.
  parentOrganizationId + evaluation_assignment/evaluation_assignment_exclusion),
  VS-051 (partición de response: businessUnitOrganizationId NOT NULL +
  unique de 3 columnas + service con unidad opcional + migración aplicada
  a Neon real), VS-052 (plazo de recepción: evaluation.dueDate/
  contactEmail + bloqueo de escritura tras vencer + PATCH
  /api/evaluations/[id] + migración aplicada a Neon real) y VS-053
  (acceso autenticado por unidad de negocio: isCorporateMode bloquea el
  token público con 404 genérico, business-unit-access.ts con snapshot
  filtrado por exclusiones + assertAnswersRespectExclusions, API
  autenticada GET/PUT /api/evaluations/[id]/for-business-unit) — 60/60
  tests db, 251 sdk-core, typecheck y build verdes en los 3 paquetes. La
  feature completa NO está cerrada — faltan varios slices más (ver
  proximos_pasos). NO se ha hecho verificación en producción de estas
  piezas porque no hay UI todavía que las ejerza (es puramente
  backend/schema); la verificación en producción real llega cuando se
  implemente el panel Publicar (último ítem de proximos_pasos) y se
  pueda probar el flujo de punta a punta con una organización matriz +
  unidades de negocio reales. El bloqueo de escritura por dueDate SÍ es
  verificable ya contra la evaluación real publicada si el usuario la
  fija con un plazo vencido, pero no se tocó producción para eso.

  El spec completo (`docs/domain/business-units.md`) ya pasó por dos
  rondas de correcciones explícitas del usuario DESPUÉS de escrito —
  ver decisiones_del_dia arriba (filtrado a nivel de elemento, no
  Subindicador; dueDate nunca vuelve a null). Al retomar, leer ese
  archivo completo antes de seguir implementando — tiene todas las
  decisiones de diseño ya cerradas, no hace falta volver a preguntarle
  al usuario salvo que la implementación revele algo que el spec no
  cubre.

  Nada de la DB real de producción fue tocado para datos de evaluados
  (solo schema nuevo, columnas/tablas vacías o nullable) — no hay
  riesgo de haber afectado datos reales en estos slices. En VS-051 la
  migración hizo backfill de las 3 filas existentes de `response` con
  `evaluation.organization_id` (0 huérfanas, verificado) — esas filas
  quedaron con la partición correcta y siguen respondiendo igual en el
  flujo público (sin unidad indicada, el service resuelve a la org
  dueña = mismo valor backfilleado). VS-052 solo agregó columnas
  nullable, sin tocar filas existentes.

  Datos de prueba en la DB real de producción (NO borrar sin
  confirmación explícita del usuario): además de los históricos
  detallados abajo, quedó un residuo de los tests de VS-051:
  la evaluación `f0107499-e3aa-4bf6-8d04-e1c2a0c60747` (token
  `tAC0iqS-YX5Wfk7hsXYExezdEWTC0BaI`, org `WKMyZGD1jzKssIledToDBPt26NFZZXiA`)
  con 1 respuesta, creada 2026-08-17T23:40 por una corrida cuyo afterAll
  falló — borrarla requiere confirmación explícita del usuario.

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

  Para retomar: este checkpoint YA tiene un slice en progreso (VS-054+,
  unidades de negocio — VS-053 cerrado, backend del acceso listo) —
  continuar ahí directamente, no ir a
  docs/BACKLOG.md/ROADMAP.md salvo que el usuario pida otra cosa. Leer
  `docs/domain/business-units.md` completo antes de seguir. Comando de
  verificación: pnpm install && pnpm slice:close. Al tocar `response`
  vía SQL crudo: citar SIEMPRE nombres camelCase con comillas dobles y
  mantenerlos ≤63 chars (NAMEDATALEN), y verificar el resultado por
  introspección directa (`pg_constraint`/`pg_indexes`) — `db:push` no
  sirve de verificación para esta tabla (falso positivo conocido,
  ver bugs.md). Los scripts temporales contra Neon deben usar import
  dinámico + parseo propio de `DATABASE_URL` del `.env` del repo (el
  binario `dotenv` global no es el dotenv-cli de los scripts del repo).
