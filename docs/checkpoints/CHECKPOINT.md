# Checkpoint — Estado actual del proyecto

**Última actualización**: 2026-08-17  
**Branch activa**: main  
**Último slice cerrado**: VS-053 (acceso autenticado por unidad de negocio)  
**Slice en progreso**: VS-054 (Runtime autenticado + panel Publicar — PARCIAL)

## Resumen ejecutivo

Plataforma de evaluación empresarial interna (CSA) en producción en Vercel (`csa-v3-web.vercel.app`). Modo público con token anónimo funcional (VS-009+), infraestructura de unidades de negocio y asignaciones completada en backend (VS-050, VS-051, VS-053). VS-054 parcialmente implementado: rutas API de asignaciones y banner de plazo creados; pendiente integración en UI (Runtime autenticado, panel Publicar, evidencias autenticadas).

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

## Slice en progreso (VS-054 — PARCIAL)

**Alcance original**: Runtime autenticado, banner de plazo, panel "Publicar" mínimo en Builder.

**Completado** (2026-08-17):
- **Rutas API** (backend):
  - `GET/POST /api/evaluations/[id]/assignments` — listar/crear asignaciones de unidades de negocio
  - `DELETE /api/evaluations/[id]/assignments/[assignmentId]` — desasignar unidad
  - `GET /api/organizations/children` — listar unidades de negocio hijas de la organización activa
  - `GET /api/evaluations/[id]/for-business-unit/responses` — cargar todas las respuestas de la unidad autenticada
  - Helper `listChildOrganizations(parentOrganizationId)` agregado a `authz.ts` y exportado
- **Componente compartido**: `DueDateBanner` en `apps/web/components/due-date-banner.tsx` (aviso 2-3 días antes / cierre tras vencimiento con `contactEmail`)
- **Tests de verificación VS-053**: 2 tests nuevos de cross-tenant isolation agregados a `business-unit-access.test.ts`
- **Estado**: 61/61 tests, typecheck/build limpios

**Pendiente para cierre de VS-054 o diferido a VS-055**:
1. Integrar `<DueDateBanner>` en Runtime público (`/evaluations/[token]/page.tsx`)
2. Crear Runtime autenticado (`/evaluations/authenticated/[id]/page.tsx`) que consuma rutas `for-business-unit`
3. Crear rutas de evidencias autenticadas (espejo de `/api/public/evaluations/[token]/evidences/*` con validación de assignment) — las públicas NO validan modo corporativo
4. Implementar panel "Publicar" en `apps/web/app/frameworks/[frameworkId]/builder/page.tsx`:
   - Botón "Publicar" junto al área del SubindicatorEditor
   - Modal/drawer con: generar/listar evaluaciones + Revocar, enlace público (solo si sin asignaciones), campos `dueDate`/`contactEmail` editables, checklist de unidades (asignar/desasignar usando rutas creadas)
   - Migrar funcionalidad CSV export de la página que se elimina
5. Eliminar `apps/web/app/frameworks/[frameworkId]/page.tsx` (reemplazado por panel en Builder)
6. Editor de exclusiones por Subindicador/elemento (UI) — backend ya existe (VS-050)
7. Dashboard de progreso por unidad (consolidado para la matriz)
8. Export XLSX multi-pestaña (consolidado + una por unidad)

**Decisiones de diseño documentadas** en `docs/project_notes/VS-054-implementation-notes.md`:
- Runtime autenticado: ruta separada `/evaluations/authenticated/[id]` en vez de detectar sesión en ruta pública
- Evidencias autenticadas: requieren rutas nuevas (públicas no validan modo corporativo)
- Panel Publicar: drawer CSS (patrón `.form-preview-drawer`), no modal de librería
- Editor de exclusiones y dashboard: diferidos a siguiente slice

## Próximos pasos inmediatos

**Opción A — Completar VS-054 (alcance reducido)**:
1. Integrar banner en Runtime público
2. Crear Runtime autenticado básico (sin evidencias por ahora)
3. Panel Publicar mínimo (sin editor de exclusiones ni dashboard)
4. Eliminar página antigua
5. Cerrar slice con CHANGELOG/CHECKPOINT/issues actualizados

**Opción B — Marcar VS-054 como parcial y avanzar**:
1. Documentar VS-054 como "backend + banner componente" (ya está)
2. Crear VS-055 para UI completa (Runtime autenticado + panel Publicar + evidencias + exclusiones + dashboard + XLSX)

**Recomendación**: Opción B — lo construido en VS-054 es funcional y testeado; el resto es una iteración UI significativa que merece su propio slice documentado.

## Backlog prioritario

Ver `docs/BACKLOG.md` para la lista completa. Resumen de los próximos slices técnicos:

1. **VS-055** — UI de unidades de negocio (Runtime autenticado, panel Publicar completo, evidencias autenticadas, exclusiones, dashboard, export XLSX)
2. **VS-056** — Motor de fórmulas extendido (`evaluateTableExpression` con contexto de fila/celda, validación de dependencias cíclicas, soporte para funciones agregadas)
3. **VS-057** — Gestión de evidencias mejorada (preview inline, organización por carpetas, límites de cuota)

## Decisiones pendientes

- **Export XLSX**: librería decidida (`exceljs`, confirmado por el usuario), pendiente implementación
- **Notificaciones por email**: sin proveedor seleccionado (Resend candidato, pero fuera de alcance por ahora)
- **Tracking de progreso individual**: descartado explícitamente; el eje de agregación es la unidad de negocio, no la persona

## Riesgos activos

Ver `docs/RISKS.md`. Sin riesgos nuevos desde VS-053. Monitorear:
- **R-005** (cuota Neon free tier): 12/13 branches usados, OK por ahora.
- **R-006** (Cloudflare R2): ~300 MB / 10 GB usados (3%), suficiente para años al ritmo actual.

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
cat docs/project_notes/VS-054-implementation-notes.md  # decisiones de diseño VS-054 parcial
```
