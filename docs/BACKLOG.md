# Backlog

Ordenado por prioridad de ejecución (= orden del roadmap, salvo excepción justificada aquí).

## Siguiente

- [ ] VS-004 — Dominio core CRUD (API tipada SDK-first para Framework/Dimensión/Indicador/Subindicador)
- [ ] VS-005 — Migraciones DB del modelo core (Drizzle)
- [ ] Decidir proveedor de email/SMTP (ADR) si se necesita invitación automática por correo — hoy el link se comparte manualmente (ver `docs/domain/organization-user.md`)
- [ ] Cambiar `DATABASE_URL` a la connection string *pooled* de Neon antes de un despliegue real (`docs/RISKS.md` R-006)
- [ ] Migrar a migraciones versionadas de Drizzle en vez de `db:push` cuando exista un segundo entorno (`docs/TECH_DEBT.md` TD-001)

## Completado

- [x] VS-001 — Scaffold monorepo (pnpm + Turborepo + TS strict + Vitest + CI) — 2026-08-04
- [x] VS-002 — Gobernanza + Checkpoint Manager — 2026-08-04
- [x] VS-003 — Auth + Organización (Better Auth + plugin organization, Neon real, 6 tests) — 2026-08-04

## Reglas de entrada al backlog

Ningún ítem se implementa sin especificación previa en `docs/` (ver `README.md`, regla rectora doc-first).
