# Backlog

Ordenado por prioridad de ejecución (= orden del roadmap, salvo excepción justificada aquí).

## Siguiente

- [ ] VS-007 — Form Engine v1 (M4): elementos básicos dentro de un Subindicador, validación, autosave
- [ ] Decidir proveedor de email/SMTP (ADR) si se necesita invitación automática por correo — hoy el link se comparte manualmente (ver `docs/domain/organization-user.md`)
- [ ] Cambiar `DATABASE_URL` a la connection string *pooled* de Neon antes de un despliegue real (`docs/RISKS.md` R-006)
- [ ] Migrar a migraciones versionadas de Drizzle en vez de `db:push` cuando exista un segundo entorno (`docs/TECH_DEBT.md` TD-001)
- [ ] Añadir Playwright para el Builder cuando haya más de un flujo crítico (`docs/TECH_DEBT.md` TD-003)

## Completado

- [x] VS-001 — Scaffold monorepo (pnpm + Turborepo + TS strict + Vitest + CI) — 2026-08-04
- [x] VS-002 — Gobernanza + Checkpoint Manager — 2026-08-04
- [x] VS-003 — Auth + Organización (Better Auth + plugin organization, Neon real, 6 tests) — 2026-08-04
- [x] VS-004 — Dominio core CRUD + schema (Framework→Dimensión→Indicador→Subindicador, 6 tests) — 2026-08-04
- [x] VS-006 — Builder jerárquico (UI, verificado en navegador real) — 2026-08-04

## Reglas de entrada al backlog

Ningún ítem se implementa sin especificación previa en `docs/` (ver `README.md`, regla rectora doc-first).
