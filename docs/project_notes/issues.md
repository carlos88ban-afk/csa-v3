# Work Log

Registro rápido de trabajo completado por slice. No reemplaza `docs/slices/` ni `docs/CHANGELOG.md` — es una referencia rápida cronológica.

### 2026-08-04 - VS-001: Scaffold monorepo
- **Status**: Completed
- **Description**: pnpm workspace + Turborepo + TS strict + Vitest + CI. `packages/sdk-core` con test real, build/test/typecheck verificados en verde localmente.
- **Notes**: Ver `docs/slices/VS-001.md`.

### 2026-08-04 - VS-002: Gobernanza + Checkpoint Manager
- **Status**: Completed
- **Description**: Árbol completo de `docs/` (visión, objetivos, alcance, roadmap, backlog, riesgos, deuda técnica, dominio, arquitectura, ADRs 0001–0005, checkpoints, project_notes).
- **Notes**: Ver `docs/slices/VS-002.md`. Stack cerrado tras análisis de la propuesta inicial de OpenCode y corrección de tres datos técnicos (Vercel Hobby ToS comercial, tope real de Neon, riesgo de recorte silencioso de Oracle Cloud Always Free).

### 2026-08-04 - Análisis de propuesta de stack (OpenCode)
- **Status**: Completed
- **Description**: Se verificaron con búsqueda web las afirmaciones técnicas de la propuesta inicial. Se confirmó R2/Better Auth/Drizzle/Vitest+Playwright sin cambios. Se corrigió: (1) Vercel Hobby prohíbe uso comercial — resuelto confirmando que el proyecto es uso interno; (2) Neon omitía el tope de 100 CU-h/mes — documentado como riesgo monitoreado; (3) Postgres self-hosted en Oracle Cloud Always Free fue considerado pero descartado por recorte de cuota sin previo aviso en jun-2026 — se optó por Neon.
- **Notes**: Detalle completo en `docs/adr/0001-*.md` y `docs/adr/0002-*.md`.
