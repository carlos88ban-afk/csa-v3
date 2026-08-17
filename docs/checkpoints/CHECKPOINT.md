# Checkpoint — Estado actual del proyecto

**Última actualización**: 2026-08-17  
**Branch activa**: main  
**Último slice cerrado**: VS-054 (Runtime autenticado + panel Publicar)  
**Slice en progreso**: VS-055 (exclusiones UI, dashboard, XLSX — ver BACKLOG)

## Resumen ejecutivo

Plataforma de evaluación empresarial interna (CSA) en producción en Vercel (`csa-v3-web.vercel.app`). Modo público con token anónimo funcional (VS-009+), infraestructura de unidades de negocio y asignaciones completada en backend (VS-050, VS-051, VS-052, VS-053). VS-054 COMPLETADO: Runtime compartido (público + autenticado), evidencias autenticadas, panel Publicar en Builder. Pendiente para VS-055: editor de exclusiones (UI), dashboard por unidad, export XLSX.

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

**Alcance original**: Runtime autenticado, banner de plazo, panel "Publicar" mínimo en Builder. — **COMPLETADO** (2026-08-17)

**Qué se construyó**:
- **Runtime compartido** (`apps/web/components/runtime-shell.tsx`, ~1990 líneas): TODO el runtime público extraído de `app/evaluations/[token]/page.tsx` a un componente reutilizable `RuntimeShell` con props `{ mode: "public" | "authenticated"; token?; evaluationId? }` que calcula `apiBase` según modo. Subcomponentes (`EvidenceView`, `OptionReferencesView`, `SubOptionsView`, `ElementView`) pasan de `token` a `base`. `pageLocked`: si `dueDate` venció → formulario entero de solo lectura (réplica UX del 403 `evaluation_DUE_DATE_PASSED`). Error mapping: `evaluation_assignment` en modo autenticado → pantalla de acceso denegado.
- **Páginas**: `app/evaluations/[token]/page.tsx` reescrita como wrapper delgado; `app/evaluations/authenticated/[id]/page.tsx` NUEVA (runtime autenticado de VS-053).
- **Evidencias autenticadas (espejo)**: `DELETE /api/evaluations/[id]/for-business-unit/evidences`, `POST .../evidences/presign`, `POST .../evidences/presign-ref`, `POST .../evidences/download-url` — mismo motor que las públicas con `requireActiveMember` + `getEvaluationForBusinessUnit`.
- **Panel Publicar en Builder**: `components/publish-panel.tsx` (drawer CSS) — publicar/revocar evaluaciones, enlace público vs corporativo, edición de `dueDate`/`contactEmail`, asignar/desasignar unidades, Exportar CSV, Revisar. Botón "Publicar" en cabecera del builder-panel (`.builder-panel__head`).
- **Eliminación**: `apps/web/app/frameworks/[frameworkId]/page.tsx` (funcionalidad migrada al Builder + PublishPanel); breadcrumbs de Builder y Revisión corregidos.
- **DueDateBanner** integrado en ambos modos del Runtime.

**Estado**: tests 61/61 db + 251/251 sdk-core, typecheck/build limpios. Documentado en CHANGELOG/issues.

**Pendiente para VS-055 (UI)**:
1. Editor de exclusiones por Subindicador/elemento (UI) — backend ya existe (VS-050)
2. Dashboard de progreso por unidad (consolidado para la matriz)
3. Export XLSX multi-pestaña (consolidado + una por unidad)
4. Verificación en producción del flujo autenticado + panel Publicar

## Próximos pasos inmediatos

**VS-055 — UI de unidades de negocio (siguiente slice)**:
1. Editor de exclusiones por Subindicador/elemento (UI) — backend ya existe (VS-050)
2. Dashboard de progreso por unidad (consolidado para la matriz)
3. Export XLSX multi-pestaña (consolidado + una por unidad)
4. Verificación en producción del flujo autenticado + panel Publicar

**Antes de cerrar VS-054**: verificar en producción el flujo autenticado de unidad de negocio y el panel Publicar (Runtime compartido + evidencias espejo + enlaces).

## Backlog prioritario

Ver `docs/BACKLOG.md` para la lista completa. Resumen de los próximos slices técnicos:

1. **VS-055** — UI de unidades de negocio (editor de exclusiones, dashboard por unidad, export XLSX)
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
cat docs/project_notes/VS-054-implementation-notes.md  # decisiones de diseño VS-054 (completado)
```
