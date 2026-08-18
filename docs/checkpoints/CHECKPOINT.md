# Checkpoint — Estado actual del proyecto

**Última actualización**: 2026-08-18  
**Branch activa**: main  
**Último slice cerrado**: VS-065 (campo elegido por el admin al marcar una celda casilla + fix de alineación checkbox/texto) — commiteado y verificado en producción end-to-end, ver "Verificación en producción" abajo.  
**Slice en progreso**: VS-066 (combinar columnas/colspan + vista previa de contenido en el chip de celda — spec en `docs/engines/form.md`) — implementado, pendiente de commit/push y verificación en producción.

## Resumen ejecutivo

Plataforma de evaluación empresarial interna (CSA) en producción en Vercel (`csa-v3-web.vercel.app`). Modo público con token anónimo funcional (VS-009+). La feature "unidades de negocio" (VS-050 a VS-059: jerarquía de Organization, partición de Response, dueDate/contactEmail, acceso autenticado, panel Publicar, export XLSX, dashboard de progreso, bloqueo de cliente, evidencia autenticada, editor de exclusiones) está completa y **verificada de punta a punta en producción real** — asignación de unidad, aislamiento de respuestas y de progreso, bloqueo del link público en modo corporativo, rechazo de organizaciones no asignadas, export XLSX con datos reales, exclusión de Subindicador/pregunta individual reflejada en dashboard y Runtime autenticado, bloqueo de cliente por plazo vencido, y evidencia autenticada (subir/descargar/borrar + rechazo de elemento excluido) — todo confirmado con datos de prueba (borrados al terminar cada verificación). **Nota de integridad histórica**: esta misma entrada de checkpoint tuvo una versión anterior que describía un refactor de UI (`runtime-shell.tsx`) que NUNCA se llegó a commitear — corregida verificando directamente contra el código real, ver `bugs.md` para el detalle completo (mismo patrón de riesgo que VS-043/`evaluateTableExpression`).

## Verificación en producción (2026-08-18)

**VS-065** (deploy `6T9zbhcV`, `READY` — primer deploy de esta sesión con cambios de tipos TypeScript, `next build` tipó sin errores): misma celda casilla, ahora con `revealField: {type:"numero", unit:"anos"}` en vez de texto libre. Verificado con Playwright, incluyendo screenshot del fix de alineación.
- Fix visual: checkbox en tamaño normal (16px), pegado a la izquierda de su texto, alineado arriba.
- Builder: combobox "Agregar campo al marcar…" con los 3 tipos, config "Mínimo/Máximo/Unidad" tras elegir número.
- Vista previa y Runtime público: campo revelado es un `spinbutton` con unidad al lado, autosave, persistente tras recarga completa.
- Export CSV: `Fila 1: Columna 1=Sí: 3 anos`.
- Framework/evaluación de prueba borrados al terminar.

**VS-064** (deploy `4af1c4b`, `READY`): misma celda `casilla` de la verificación de VS-063, ahora con `checkboxLabel` propio ("La empresa cuenta con una cláusula de recuperación de recursos. Por favor, especifica:"), distinto de `content` (título/descripción). Verificado con Playwright.
- Builder: campo "Etiqueta de la casilla" separado de "Texto fijo antes del control".
- Vista previa y Runtime público: el checkbox expone `checkboxLabel` como nombre accesible (confirmado en el árbol de accesibilidad — antes no tenía ninguno), autosave y persistente tras recarga completa.
- Export CSV: sin regresión, `checkboxLabel` no se exporta (presentación).
- Framework/evaluación de prueba borrados al terminar.

**VS-063** (deploy `bf23569`, `READY`): framework temporal con un elemento `tabla_datos` de 1 celda `casilla` (`revealText: true`) con `content` fijo, reproduciendo el caso real de S&P (título+descripción+etiqueta del checkbox como texto fijo, checkbox+campo revelado como control). Verificado con Playwright.
- Builder: campo "Texto fijo antes del control (opcional)" visible en la config de una celda `casilla` editable.
- Vista previa: texto fijo (negrita) renderizado, luego el checkbox; "Especifique" aparece al marcarlo.
- Runtime público: misma estructura, autosave, persistente tras recarga completa de página real.
- Export CSV: `Fila 1: Columna 1=Sí: 3 anos con extension` — el texto fijo no se exporta (correcto, es solo presentación).
- Framework/evaluación de prueba borrados al terminar.

**VS-061 + VS-062** (deploy `10ff761`, `READY`): framework temporal ("QA VS-061-062 verificacion") con 1 pregunta `seleccion_unica` cuya opción combina un campo embebido `texto_corto` (VS-062) y una tabla embebida con una celda `casilla` con `revealText` (VS-061), evaluación pública publicada. Verificado con Playwright.
- Builder: combobox "Agregar campo…" y opción "Casilla de verificación" + "Permitir texto adicional al marcar" confirmados en el editor de la opción.
- Vista previa del Builder: campo y tabla aparecen al marcar la opción; "Especifique" aparece al marcar la casilla.
- Runtime público: campo (`USD`) y casilla+texto (`clausula real de recuperacion`) guardados con autosave, persistentes tras recarga completa de página real.
- Export CSV: `Opcion Si (USD) (Tabla: Fila 1: Columna 1=Sí: clausula real de recuperacion)`.
- Framework/evaluación de prueba borrados al terminar (`DELETE /api/frameworks/:id`).

**VS-060**: framework temporal con 1 pregunta `seleccion_unica` de 2 opciones (la primera con tabla embebida de una celda numérica), evaluación pública publicada, borrados al terminar.
- Builder: botón "Agregar tabla" visible en la opción de nivel superior, mismo `TableConfigEditor` reutilizado (cambio de tipo de celda a Número confirmado).
- Vista previa del Builder: tabla se renderiza al marcar la opción, acepta el valor.
- Runtime público: valor guardado (autosave), confirmado persistente tras recarga completa de página real (no solo estado en memoria), y el valor sobrevive aunque la opción quede temporalmente desmarcada (el answer no se borra al ocultar).
- Export CSV: `(Tabla: Fila 1: Columna 1=4)` anexado correctamente a la celda Respuesta de la opción elegida.
- Deploy Vercel confirmado `READY` antes de la verificación funcional (sin build/typecheck local, por instrucción del usuario).

**VS-057/058/059**: framework temporal (1 Dimensión, 1 Subindicador directo, 2 preguntas + 1 Evidencia agregada durante la verificación) + 2 Evaluaciones + 1 organización-unidad-de-negocio, todo borrado al terminar.
- **Bug real encontrado y corregido**: editor de exclusiones mostraba preguntas sin texto como el string literal `<p></p>` en vez de "(sin texto)" — fix con `stripCommentHtml`, ver `bugs.md`.
- **Exclusiones (VS-059)**: excluir 1 pregunta → dashboard `0/2`→`0/1`, Runtime autenticado dejó de mostrarla; excluir el Subindicador completo → dashboard `0/0`, Runtime mostró el Subindicador vacío; re-incluir revirtió ambos casos; pills de resumen correctos en cada paso.
- **Bloqueo de cliente (VS-057)**: con `dueDate` vencido, banner "Esta evaluación ha finalizado", inputs y "Guardar" deshabilitados en el DOM real, y un intento de escritura directo a la API confirmó 403 `evaluation_DUE_DATE_PASSED` server-side; pill "Plazo vencido" del dashboard también correcto.
- **Evidencia autenticada (VS-058)**: sobre una evaluación nueva sin plazo, upload real vía `presign` + `Descargar` (URL prefirmada de R2 válida, abierta en pestaña nueva) + `Quitar` (DELETE) confirmados; un elemento `evidencia` excluido para la unidad devolvió `element_NOT_EVIDENCE` al intentar `presign`, confirmando que la exclusión se hereda del snapshot filtrado sin código nuevo.

## Verificación en producción (2026-08-17)

**VS-054** (deploy `f2acd7c`): framework temporal + 2 Evaluaciones + 2 organizaciones-unidad-de-negocio de prueba, borrados al terminar con confirmación explícita del usuario.
- **Bug real encontrado y corregido**: filas del panel Publicar superpuestas/desbordadas en el drawer angosto (`.entry-list__row` diseñada para 2 hijos, el panel le agrega 2 más) — fix de CSS, ver `bugs.md`.
- **Confirmado funcionando**: Publicar/Revocar; `dueDate`/`contactEmail` persisten tras recarga; Runtime público con autosave y persistencia; asignar unidad de negocio oculta el link público y lo hace 404 (VS-053); Runtime autenticado carga y guarda, con respuestas **aisladas** entre modo público y unidad de negocio sobre la misma Evaluación (confirma partición VS-051 en producción real, no solo en tests); organización no asignada recibe el mismo 404 genérico (sin fuga de información).
- `parentOrganizationId` (Better Auth `additionalFields`, VS-050) confirmado funcional en producción vía `POST /api/auth/organization/update`.

**VS-055** (deploy del commit `c592d98`): framework temporal + 2 Evaluaciones (una para regresión de CSV) + 2 organizaciones-unidad-de-negocio de prueba, borrados al terminar.
- Dashboard: dos unidades asignadas (2 preguntas cada una) muestran `0% (0/2)` antes de responder; tras guardar ambas respuestas desde el Runtime autenticado de una unidad, su pill pasa a `100% (2/2)` **en vivo**, la otra unidad se mantiene en `0% (0/2)` — aislamiento confirmado con datos reales.
- Export XLSX: 200, content-type correcto, 8.4 KB (3 hojas con datos). Evaluación sin unidades asignadas → 400 con el mensaje esperado.
- Tenant-scoping: una unidad de negocio recibe 404 al pedir `.../progress` o `.../export-xlsx` de la Evaluación de su matriz.
- Regresión: el export CSV existente (evaluación sin unidades de negocio) sigue devolviendo 200 tras el refactor de `evaluation-export.ts`.

## Stack técnico

- **Frontend/Backend**: Next.js 16.3 (App Router, React Server Components, Turbopack), TypeScript strict
- **DB**: Neon Postgres serverless (prod + dev compartida, tabla`organization` con `parentOrganizationId` self-reference para jerarquía de unidades de negocio)
- **Auth**: Better Auth 1.6.25 (session + organization multi-tenant)
- **ORM**: Drizzle 0.42
- **Storage**: Cloudflare R2 (evidencias, 10 GB free tier — suficiente por años)
- **Deploy**: Vercel (hobby plan, sin límite de deploys, analytics deshabilitado para ahorrar cuota)
- **Monorepo**: pnpm workspaces + Turbo 2.10.8

## Último slice completado (VS-053)

**Funcionalidad**: acceso autenticado del evaluado por unidad de negocio.

**Qué se construyó**:
- Rutas API autenticadas `GET /api/evaluations/[id]/for-business-unit` (devuelve snapshot filtrado con exclusiones aplicadas) y `PUT .../for-business-unit/responses/[subindicatorId]` (guarda respuestas validando asignación + exclusiones)
- Validación `assertAnswersRespectExclusions` (rechaza respuestas a elementos excluidos individuales o Subindicadores completos)
- Bloqueo de ruta pública (`GET /api/public/evaluations/[token]`) cuando `isCorporateMode(evaluationId)` devuelve true (≥1 asignación de unidad de negocio)
- Tests de aislamiento cross-tenant: unidad A no puede leer/escribir datos de evaluación asignada a unidad B (403)

**Estado**: tests 61/61, typecheck/build limpios, documentado en CHANGELOG/issues. Commits `7e95e6e` (dominio), `3530032` (rutas API).

## Último slice completado (VS-054)

**Alcance real construido** (2026-08-17, verificado directamente contra el árbol de trabajo, no contra un reporte):

- **`RuntimeCore`/`RuntimeAdapter`** (`apps/web/app/evaluations/[token]/page.tsx`): en vez del refactor grande que se había intentado y abandonado (`runtime-shell.tsx`, nunca commiteado), se extrajo un componente `RuntimeCore` (exportado) parametrizado por un `RuntimeAdapter` con 3 funciones (`fetchEvaluation`/`fetchResponses`/`saveResponse`). El default export público queda como wrapper delgado. `ElementView`/`EvidenceView`/`OptionReferencesView` reciben `token: string | undefined` — `undefined` en modo autenticado hace que la evidencia degrade a un aviso ("no disponible en este modo todavía") en vez de intentar armar una URL de API sin token.
- `apps/web/app/evaluations/authenticated/[id]/page.tsx`: wrapper delgado sobre `RuntimeCore` con el adapter autenticado (rutas `for-business-unit` de VS-053/054), `evidenceToken={undefined}`.
- **API nuevas**: `GET/POST /api/evaluations/[id]/assignments`, `DELETE .../assignments/[assignmentId]`, `GET /api/organizations/children`, `GET /api/evaluations/[id]/for-business-unit/responses`. Helper `listChildOrganizations` en `packages/db/src/authz.ts`.
- **Panel Publicar** (`apps/web/components/publish-panel.tsx`, drawer sobre las clases CSS `.form-preview-drawer` ya existentes): publicar/revocar evaluaciones, enlace público (oculto en modo corporativo), `dueDate`/`contactEmail` editables (PATCH), checklist de asignar/desasignar unidades de negocio. Botón "Publicar" en una barra superior nueva del Builder (`.builder-topbar`).
- **Eliminación**: `apps/web/app/frameworks/[frameworkId]/page.tsx` borrada; 2 breadcrumbs que enlazaban ahí corregidos (Builder, página de Revisión) — confirmado con grep que no queda ningún enlace muerto.
- `<DueDateBanner>` integrado dentro de `RuntimeCore` (ambos modos).

**Deferido explícitamente, NO construido en este slice** (a diferencia de lo que una versión anterior de este documento afirmaba):
- Rutas de evidencia autenticadas (espejo de las públicas `presign`/`presign-ref`/`download-url`/delete) — no existen.
- Bloqueo proactivo del formulario en el cliente cuando vence el plazo — hoy el bloqueo sigue siendo solo de servidor (403 al guardar, desde VS-052); el banner avisa pero no deshabilita inputs.
- Editor de exclusiones por Subindicador/elemento (UI) y dashboard de progreso por unidad — el checklist del panel Publicar solo asigna/desasigna, no filtra preguntas.
- Export XLSX consolidado.

**Estado técnico**: 61/61 tests `db`, 251/251 `sdk-core`, typecheck y build limpios en los 3 paquetes. **Verificado en producción end-to-end** (ver sección arriba) — bug de CSS real encontrado y corregido en el camino.

## Último slice completado (VS-055)

**Export XLSX consolidado** (commit `3ae783f`): `GET /api/evaluations/[id]/export-xlsx` (exceljs) con pestaña "Consolidado" + una por unidad, refactor de serialización a `lib/evaluation-export.ts` (compartido con CSV), link del panel Publicar → "Exportar XLSX consolidado" en modo corporativo. 400 si no hay asignaciones (sugiere CSV); solo matriz (una unidad de negocio recibe 404).

**Dashboard de progreso por unidad** (commit `c592d98`): `getBusinessUnitProgress` (`packages/db/src/domain/business-unit-access.ts`, agrega preguntas totales/respondidas sobre snapshot filtrado por exclusiones) + 2 tests nuevos; `GET /api/evaluations/[id]/progress` (solo matriz, devuelve `{ units: [{ businessUnitOrganizationId, name, ...progress }] }`); pills de porcentaje + "Plazo vencido" en el panel Publicar (`.publish-panel__unit-progress`).

**Estado**: 63/63 tests `db`, typecheck/build limpios en los 3 paquetes, **verificado en producción end-to-end** (ver sección arriba).

## Último slice completado (VS-057/058/059)

**Bloqueo de cliente (VS-057)**: `RuntimeCore` calcula `deadlineLocked` y lo aplica en 4 puntos (formLocked en ElementView, "Guardar" deshabilitado, "Marcar como completo" oculto, `doSave` no dispara) — réplica de UX del 403 de servidor ya existente desde VS-052.

**Evidencia autenticada (VS-058)**: 4 rutas nuevas espejo de las públicas bajo `api/evaluations/[id]/for-business-unit/evidences/*`, resolviendo vía `getEvaluationForBusinessUnit` (tenant-scoping + exclusiones heredadas del snapshot filtrado, sin código de exclusión nuevo). El prop `token` en la cadena Runtime pasa a ser la URL base de evidencia, no el token pelado.

**Editor de exclusiones (VS-059)**: `components/exclusion-editor.tsx` + rutas `GET/POST .../exclusions` y `DELETE .../exclusions/[exclusionId]` (backend ya existía desde VS-050). Árbol completo (sin filtrar) con checkbox por Subindicador/pregunta, integrado como toggle en el panel Publicar.

**Estado técnico**: **verificado en producción end-to-end** (ver sección arriba) — bug real de label vacío encontrado y corregido en el camino.

## Último slice completado (VS-064)

**Etiqueta propia de una celda casilla**: corrección a VS-063 pedida por el usuario (el checkbox no tenía ninguna etiqueta propia — accesibilidad real, no cosmético). `formTableCell` gana `checkboxLabel?: string`, distinto de `content` (título/descripción fijo de la celda). El checkbox pasa de `<input>` suelto a `<label className="field field--checkbox">` envolviendo el control, con `checkboxLabel` como texto (o un `sr-only` "Marcar" si el admin no lo completó).

**Estado técnico**: **verificado en producción end-to-end** (ver sección arriba) — nombre accesible del checkbox confirmado en el árbol de accesibilidad real.

## Último slice completado (VS-063)

**Contenido fijo como prefijo de una celda editable**: `formTableCell.content` (VS-047) deja de ignorarse cuando `editable !== false` — si está presente en una celda editable, se renderiza como texto fijo ANTES del control interactivo. Sin cambio de schema. Builder gana un campo "Texto fijo antes del control (opcional)" en la config de celda editable; Runtime/Preview renderizan `content` como primer hijo en las 4 ramas de celda editable (`seleccion_desplegable`/`numero`/`casilla`/`texto`). Resuelve el caso "celda verdaderamente mixta" que VS-061 había dejado fuera de alcance.

**Estado técnico**: **verificado en producción end-to-end** (ver sección arriba).

## Último slice completado (VS-061 + VS-062)

**Celda de tabla tipo casilla con texto revelado (VS-061)**: `formTableCellType` gana `"casilla"` + `formTableCell.revealText`; valor `"true"`/`""` (mismo patrón que `naKey`), texto revelado bajo `commentKey` compuesto. Builder/Runtime/Preview/export reusan el `TableConfigEditor`/`FormTableView`/`PreviewTableView` ya existentes, una rama más.

**Campo embebido directo en una opción de nivel superior (VS-062)**: `formOption` gana `field: subOptionField.optional()` (mismo tipo que `subOption.field` de VS-040). Builder: `addOptionField`/`removeOptionField`/etc, mismo patrón que las funciones equivalentes de sub-opción. Runtime/Preview reusan `SubOptionFieldView`/`PreviewSubOptionField` tal cual. Export: `formatOptionLabel` resuelve `opt.field`.

**Estado técnico**: **verificado en producción end-to-end** (ver sección arriba) — Builder, Vista previa, Runtime público (con recarga completa) y export CSV confirmados con datos reales, ambos gaps combinados en un mismo caso de prueba.

## Último slice completado (VS-060)

**Tabla embebida directo en una opción de nivel superior**: `formOption` gana `table` (mismo shape que `subOption.table` de VS-042). Runtime/Preview reutilizan `FormTableView`/`PreviewTableView`, clave `${elementId}::${optionId}::table`. Builder: `addOptionTable`/`removeOptionTable`/`updateOptionTable` + `TableConfigEditor` reutilizado. Export: `formatEmbeddedTable` extraído como helper compartido con `subOption.table`.

**Estado técnico**: **verificado en producción end-to-end** (ver sección arriba) — Builder, Vista previa, Runtime público (con recarga completa) y export CSV confirmados con datos reales.

## Próximos pasos inmediatos

Sin pendientes conocidos. Próximo trabajo a definir con el usuario.

## Decisiones pendientes

- ~~**Export XLSX**~~: **resuelta** — `exceljs` implementado y commiteado (`3ae783f`).
- **Notificaciones por email**: sin proveedor seleccionado, fuera de alcance (ver `organization-user.md`).
- **Tracking de progreso individual**: descartado explícitamente; el eje de agregación es la unidad de negocio, no la persona.

## Riesgos activos

Ver `docs/RISKS.md` para la lista completa y actualizada — no se hizo ninguna revisión de riesgos nueva en este slice, así que no se repiten números acá para evitar que queden desactualizados sin que nadie los revise.

## Referencias rápidas

- **Arquitectura**: `docs/domain/business-units.md` (unidades de negocio), `docs/engines/*.md` (publishing, persistence, form, formula)
- **Historial**: `docs/CHANGELOG.md` (entradas por slice), `docs/project_notes/issues.md` (registro rápido de trabajo)
- **ADRs formales**: `docs/adr/` (Better Auth, Drizzle, Neon, no-code philosophy)

## Comando de retoma

```bash
# Leer en orden:
cat docs/checkpoints/CHECKPOINT.md
cat docs/BACKLOG.md
cat docs/ROADMAP.md
```
