# Backlog

Ordenado por prioridad de ejecución (= orden del roadmap, salvo excepción justificada aquí).

## Siguiente

- [ ] VS-013 — Motores: fórmula + reglas condicionales (M10)
- [ ] Decidir proveedor de email/SMTP (ADR) si se necesita invitación automática por correo — hoy el link se comparte manualmente (ver `docs/domain/organization-user.md`)
- [ ] Migrar a migraciones versionadas de Drizzle en vez de `db:push` cuando exista un segundo entorno (`docs/TECH_DEBT.md` TD-001)
- [ ] Añadir Playwright para el Builder cuando haya más de un flujo crítico (`docs/TECH_DEBT.md` TD-003)
- [ ] Si se necesita reconstruir el historial de una revisión de `formSchema` fuera del contexto de una publicación, construir una tabla de historial real (ver `docs/engines/publishing.md`, decisión de usar snapshot en vez de historial)

## Completado

- [x] VS-001 — Scaffold monorepo (pnpm + Turborepo + TS strict + Vitest + CI) — 2026-08-04
- [x] VS-002 — Gobernanza + Checkpoint Manager — 2026-08-04
- [x] VS-003 — Auth + Organización (Better Auth + plugin organization, Neon real, 6 tests) — 2026-08-04
- [x] VS-004 — Dominio core CRUD + schema (Framework→Dimensión→Indicador→Subindicador, 6 tests) — 2026-08-04
- [x] VS-006 — Builder jerárquico (UI, verificado en navegador real) — 2026-08-04
- [x] VS-007 — Form Engine v1 (7 tipos de elemento, autosave, verificado en navegador real) — 2026-08-05
- [x] VS-008 — Registry de componentes pluggable + versionado (verificado en producción) — 2026-08-05
- [x] VS-009 — Publicación + enlaces seguros (snapshot inmutable, verificado en producción) — 2026-08-05
- [x] VS-010 — Runtime de respuesta + guardar progreso (árbol de navegación, autosave, progreso, verificado en producción) — 2026-08-05
- [x] VS-011 — Evidencias (uploads → R2, presigned URLs, verificado en producción) — 2026-08-05
- [x] VS-012 — Exportación de resultados (CSV, RFC 4180, BOM UTF-8, verificado en producción) — 2026-08-05

## Reglas de entrada al backlog

Ningún ítem se implementa sin especificación previa en `docs/` (ver `README.md`, regla rectora doc-first).
