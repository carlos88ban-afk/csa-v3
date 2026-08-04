# Changelog

Formato: por slice, no por commit individual.

## [Unreleased]

### VS-003 — Auth + Organización (2026-08-04)

- `docs/domain/organization-user.md`: especificación doc-first del agregado Organization/User/Member/Invitation.
- `packages/db` (nuevo): cliente Drizzle sobre Neon, schema de Better Auth generado con su CLI oficial (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`), aplicado a Neon con `drizzle-kit push`.
- Configuración de Better Auth con plugin `organization`: email/password, roles `owner`/`member`, envío de email de invitación desactivado (no hay proveedor de email decidido — el link de aceptación se expone en la respuesta de la API).
- `apps/web` (nuevo): primera app Next.js del monorepo, App Router, con la ruta `app/api/auth/[...all]` sirviendo Better Auth.
- 6 tests de Vitest en `packages/db` cubriendo registro, login, creación de organización, invitación sin email, aceptación de invitación, y tenant-scoping — corren contra el proyecto Neon real con limpieza automática de datos.
- `dotenv-cli` añadido para cargar el `.env` de la raíz de forma consistente en `build`/`test`/`dev`/`db:*`, incluso bajo Turborepo.
- `turbo.json`: corregidos los `outputs` de la task `build` para incluir `.next/**` (antes solo cacheaba `dist/**`).

### VS-002 — Gobernanza + Checkpoint Manager (2026-08-04)

- Añadido árbol completo de `docs/` (visión, objetivos, alcance, roadmap, backlog, riesgos, deuda técnica, dominio, arquitectura, ADRs 0001–0005, checkpoints, project_notes).
- Registradas ADR-0001 (hosting), 0002 (BD), 0003 (storage), 0004 (auth) como `Proposed`; ADR-0005 (tooling) como `Accepted` (ya implementada en VS-001).

### VS-001 — Scaffold monorepo (2026-08-04)

- `git init` del repositorio.
- pnpm workspace + Turborepo + TypeScript strict (`tsconfig.base.json`).
- `packages/sdk-core` mínimo con test real (build/test/typecheck verificados en verde localmente).
- CI en GitHub Actions (`.github/workflows/ci.yml`).
