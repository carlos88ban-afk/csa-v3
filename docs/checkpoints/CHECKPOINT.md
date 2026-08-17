# Checkpoint — Estado actual del proyecto

**Última actualización**: 2026-08-17  
**Branch activa**: main  
**Último slice cerrado**: VS-054 (Runtime autenticado por unidad de negocio + panel Publicar en el Builder) — sin verificación en producción todavía, ver nota abajo.  
**Slice en progreso**: ninguno asignado — siguiente candidato natural: editor de exclusiones (UI), dashboard por unidad, export XLSX consolidado (ver "Próximos pasos").

## Resumen ejecutivo

Plataforma de evaluación empresarial interna (CSA) en producción en Vercel (`csa-v3-web.vercel.app`). Modo público con token anónimo funcional (VS-009+). Infraestructura de unidades de negocio (VS-050/051/052/053) y su primera UI real (VS-054: panel Publicar en el Builder + Runtime autenticado mínimo) están en el árbol, con `pnpm typecheck`/`build`/`test` (db) en verde. **Nota de integridad importante**: esta misma entrada de checkpoint tuvo una versión anterior (sobrescrita acá) que describía un refactor de UI (`runtime-shell.tsx`, evidencias autenticadas espejo, bloqueo de formulario en cliente) que NUNCA se llegó a commitear — quedó como archivo suelto sin trackear, se abandonó, y la documentación no se corrigió para reflejarlo. Se verificó directamente contra el código real (no contra el reporte de quien lo implementó) antes de reescribir esta sección — mismo patrón de riesgo ya documentado para VS-043/`evaluateTableExpression` en `bugs.md`. Lo que realmente hay en el árbol es más simple que lo que se había descrito: ver la sección "VS-054" abajo.

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
- **Verificación en producción, en navegador real** — nada de esto se probó todavía en `csa-v3-web.vercel.app` ni en un navegador local. `typecheck`/`build`/`test` en verde no reemplaza esa verificación (ver la lección de VS-043 en `bugs.md`).

**Estado técnico**: 61/61 tests `db` (sin tests nuevos de UI — sin navegador en este entorno), 251/251 `sdk-core` sin cambios, typecheck y build limpios en los 3 paquetes.

## Próximos pasos inmediatos

1. **Verificar en producción, en navegador**: flujo completo de punta a punta — crear una organización hija desde `/organizations`, asignarla a una Evaluación desde el panel Publicar, loguearse como esa unidad, abrir `/evaluations/authenticated/[id]`, guardar al menos una respuesta, confirmar que persiste tras recargar. Esto no se hizo todavía y es el paso que falta antes de considerar VS-054 realmente cerrado.
2. Editor de exclusiones por Subindicador/elemento (UI) — backend ya existe desde VS-050.
3. Dashboard de progreso por unidad (consolidado para la matriz).
4. Export XLSX multi-pestaña (consolidado + una por unidad) — requiere instalar `exceljs`.
5. Rutas de evidencia autenticadas (espejo de las públicas).
6. Bloqueo proactivo del formulario en cliente cuando vence el plazo.

## Decisiones pendientes

- **Export XLSX**: librería decidida (`exceljs`, confirmado por el usuario), pendiente de instalar e implementar.
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
