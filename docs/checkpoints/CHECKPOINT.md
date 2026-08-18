# Checkpoint — Estado actual del proyecto

**Última actualización**: 2026-08-17  
**Branch activa**: main  
**Último slice cerrado**: VS-055 (export XLSX consolidado + dashboard de progreso por unidad) — **ambas mitades commiteadas y verificadas en producción end-to-end** (commits `3ae783f` y `c592d98`), ver "Verificación en producción" abajo.  
**Slice en progreso**: ninguno asignado — pendientes reales: editor de exclusiones por Subindicador/elemento (UI), rutas de evidencia autenticadas, bloqueo proactivo de formulario en cliente por `dueDate` vencido (ver "Próximos pasos").

## Resumen ejecutivo

Plataforma de evaluación empresarial interna (CSA) en producción en Vercel (`csa-v3-web.vercel.app`). Modo público con token anónimo funcional (VS-009+). La feature "unidades de negocio" (VS-050 a VS-055: jerarquía de Organization, partición de Response, dueDate/contactEmail, acceso autenticado, panel Publicar, export XLSX, dashboard de progreso) está completa en su alcance central y **verificada de punta a punta en producción real** — asignación de unidad, aislamiento de respuestas y de progreso, bloqueo del link público en modo corporativo, rechazo de organizaciones no asignadas, y export XLSX con datos reales, todo confirmado con datos de prueba (borrados al terminar cada verificación). **Nota de integridad histórica**: esta misma entrada de checkpoint tuvo una versión anterior que describía un refactor de UI (`runtime-shell.tsx`) que NUNCA se llegó a commitear — corregida verificando directamente contra el código real, ver `bugs.md` para el detalle completo (mismo patrón de riesgo que VS-043/`evaluateTableExpression`).

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

## Próximos pasos inmediatos

1. Editor de exclusiones por Subindicador/elemento (UI) — backend ya existe desde VS-050.
2. Rutas de evidencia autenticadas (espejo de las públicas) — modo corporativo hoy no soporta subir/ver evidencia.
3. Bloqueo proactivo del formulario en cliente cuando vence el plazo (hoy solo servidor).

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
