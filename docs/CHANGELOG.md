# Changelog

Formato: por slice, no por commit individual.

## [Unreleased]

### VS-002 — Gobernanza + Checkpoint Manager (2026-08-04)

- Añadido árbol completo de `docs/` (visión, objetivos, alcance, roadmap, backlog, riesgos, deuda técnica, dominio, arquitectura, ADRs 0001–0005, checkpoints, project_notes).
- Registradas ADR-0001 (hosting), 0002 (BD), 0003 (storage), 0004 (auth) como `Proposed`; ADR-0005 (tooling) como `Accepted` (ya implementada en VS-001).

### VS-001 — Scaffold monorepo (2026-08-04)

- `git init` del repositorio.
- pnpm workspace + Turborepo + TypeScript strict (`tsconfig.base.json`).
- `packages/sdk-core` mínimo con test real (build/test/typecheck verificados en verde localmente).
- CI en GitHub Actions (`.github/workflows/ci.yml`).
