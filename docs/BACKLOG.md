# Backlog

Ordenado por prioridad de ejecución (= orden del roadmap, salvo excepción justificada aquí).

## Siguiente

- [ ] **AN-001 2.ª inspección (menores) — Banner expandible/colapsable**: `banner` gana estado colapsado/expandido con triángulo, igual que `banner-expandable` del portal S&P. Referencia: `docs/analysis/csa-sp-global-comparison.md`, "Segunda inspección"
- [ ] **AN-001 2.ª inspección (menores) — Sub-opciones a 2 niveles**: `subOptions` (VS-016) gana un segundo nivel recursivo opcional (`subOptions[].subOptions?`)
- [ ] **AN-001 2.ª inspección (menores) — Comentario confidencial rich text**: el textarea de comentario confidencial (VS-019) gana formato enriquecido (negrita/lista/etc.), equivalente a Jodit del portal S&P
- [ ] **AN-001 2.ª inspección (menores) — Estado por nodo en el árbol**: el árbol de navegación (Runtime/Builder) muestra estado agregado por Dimensión/Indicador (no solo % global y estado por pregunta), igual que el portal S&P
- [ ] **AN-001 2.ª inspección (menores) — Subindicadores directos bajo Dimensión**: permite crear un Subindicador colgando directo de una Dimensión sin Indicador intermedio (hallazgo estructural: 0.1, 5.x en el portal S&P) — el único de los 5 con cambio de schema
- [ ] Decidir proveedor de email/SMTP (ADR) si se necesita invitación automática por correo — hoy el link se comparte manualmente (ver `docs/domain/organization-user.md`)
- [ ] Migrar a migraciones versionadas de Drizzle en vez de `db:push`, junto con provisionar una rama/proyecto Neon aislado para tests (`docs/TECH_DEBT.md` TD-001 + TD-002)
- [ ] Si se necesita reconstruir el historial de una revisión de `formSchema` fuera del contexto de una publicación, construir una tabla de historial real (ver `docs/engines/publishing.md`, decisión de usar snapshot en vez de historial)

## Completado

- [x] VS-024 — Tabla de datos `tabla_datos` (gap 9 de AN-001 2.ª inspección, el más grande y último de los 9, verificado en producción) — 2026-08-06
- [x] VS-023 — Unidad por campo numérico (`unit`/`availableUnits`, gap 8 de AN-001 2.ª inspección, verificado en producción) — 2026-08-06
- [x] VS-022 — Select dropdown `seleccion_desplegable` (gap 7 de AN-001 2.ª inspección, verificado en producción) — 2026-08-06
- [x] VS-021 — Numeración automática de árbol y preguntas (gap 6 de AN-001, último de los 6, verificado en producción) — 2026-08-06
- [x] VS-020 — Botones Save/Cancel/Reset explícitos en Runtime (gap 5 de AN-001, verificado en producción) — 2026-08-06
- [x] VS-019 — N/A + comentario confidencial por pregunta (gap 4 de AN-001, verificado en producción) — 2026-08-06
- [x] VS-018 — Estado por pregunta + flujo Approved/Submitted (gap 3 de AN-001, verificado en producción) — 2026-08-05
- [x] VS-017 — Campo URL pública, máx. N por pregunta (gap 2 de AN-001, verificado en producción) — 2026-08-05
- [x] VS-016 — Opciones anidadas en selección única/múltiple (gap 1 de AN-001, verificado en producción) — 2026-08-05
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
- [x] VS-013 — Motores fórmula + reglas condicionales (calculado, visibleIf, verificado en producción) — 2026-08-05
- [x] VS-014 — Permisos (RBAC dueño/editor/evaluador, gestión de miembros/invitaciones, verificado en producción) — 2026-08-05
- [x] VS-015 — Accesibilidad WCAG 2.2 AA (contraste, target size, skip link, aria-live, verificado en producción) — 2026-08-05
- [x] TD-003 — Playwright E2E (Builder→Publicar, Runtime público) — 2026-08-05

## Reglas de entrada al backlog

Ningún ítem se implementa sin especificación previa en `docs/` (ver `README.md`, regla rectora doc-first).
