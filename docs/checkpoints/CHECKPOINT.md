checkpoint: c9e1a1b0-0001-4a2b-8c3d-000000000001
fecha: 2026-08-04
estado: en_progreso
slice_actual: VS-003

slices_completados: [VS-001, VS-002]

decisiones_del_dia:
  - ADR-0001 (hosting Vercel Hobby) — Proposed, válido confirmado: proyecto es uso interno/no comercial
  - ADR-0002 (BD Neon) — Proposed, elegido sobre Oracle self-hosted por riesgo de política impredecible
  - ADR-0003 (storage R2) — Proposed, elegido sobre Azure Blob por egress gratuito
  - ADR-0004 (auth Better Auth) — Proposed
  - ADR-0005 (tooling monorepo) — Accepted, implementado

archivos_modificados:
  - package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json, .gitignore
  - packages/sdk-core/** (package.json, tsconfig.json, src/index.ts, src/index.test.ts)
  - .github/workflows/ci.yml
  - README.md
  - docs/** (árbol completo de gobierno, ver docs/README.md)

proximos_pasos:
  - VS-003: Auth + Organización (Better Auth, tablas organizations/users, invitación simple)
  - Antes de VS-003: especificar en docs/domain/ el agregado Organization/User y sus invariantes (doc-first)

bloqueos: []

contexto_para_continuar: |
  M0 completado: monorepo scaffoldeado (pnpm+Turborepo+TS strict+Vitest, packages/sdk-core
  con test real pasando) y árbol de gobierno docs/ completo con ADRs 0001-0005 registradas
  como Proposed (0005 Accepted). Stack cerrado: Next.js+Vercel Hobby, Neon, Drizzle,
  Cloudflare R2, Better Auth, Vitest+Playwright, pnpm+Turborepo. Riesgos documentados en
  docs/RISKS.md (R-001 a R-004). Para retomar: leer este archivo, luego docs/BACKLOG.md,
  luego empezar VS-003 siguiendo el protocolo doc-first (docs/README.md, regla rectora).
  Comando de verificación: pnpm install && pnpm build && pnpm test && pnpm typecheck
  (o pnpm slice:close).
