# Backlog

Ordenado por prioridad de ejecución (= orden del roadmap, salvo excepción justificada aquí).

## Siguiente

- [ ] Decidir proveedor de email/SMTP (ADR) si se necesita invitación automática por correo — hoy el link se comparte manualmente (ver `docs/domain/organization-user.md`)
- [ ] Migrar a migraciones versionadas de Drizzle en vez de `db:push`, junto con provisionar una rama/proyecto Neon aislado para tests (`docs/TECH_DEBT.md` TD-001 + TD-002)
- [ ] Si se necesita reconstruir el historial de una revisión de `formSchema` fuera del contexto de una publicación, construir una tabla de historial real (ver `docs/engines/publishing.md`, decisión de usar snapshot en vez de historial)

## Completado

- [x] VS-040 — Campos embebidos en sub-opciones (select/texto/número) + exclusividad configurable (`subOptionsExclusive`) — 2.º hallazgo del mismo HTML de S&P que originó VS-039 — 2026-08-14
- [x] VS-039 — Referencias de URL por opción en `seleccion_unica`/`seleccion_multiple` (hallazgo de la 4.ª inspección AN-001, 2026-08-14: S&P adjunta la fila de referencias DENTRO de cada opción del radio, no como elemento `url_publica` separado) — 2026-08-14
- [x] VS-038 — Banner: contenido con formato (RichTextEditor compartido, mismo motor que el comentario confidencial) — 2026-08-14
- [x] VS-037 — Banner: título/contenido separados + estado inicial contraído/expandido configurable (supersede VS-025, pedido explícito del usuario) — 2026-08-14
- [x] VS-036 — Conteo de miembros por organización (`authClient.organization.listMembers` en paralelo, sin ruta propia) + cierre del arco VS-033..VS-036 — 2026-08-14
- [x] VS-035 — Conteo de ítems (indicadores + subindicadores directos) por dimensión, doble join con COUNT(DISTINCT) independiente por columna — 2026-08-14
- [x] VS-034 — `DataTable` genérico + conteo de dimensiones por framework (join + count), reemplaza `.entry-list` en la lista de frameworks — 2026-08-14
- [x] VS-033 — Pivote visual: shell de dashboard empresarial ancho (sidebar + `--content-width` 1180px, reemplaza la decisión "columna angosta ~840px" documentada en design-system.md — pedido explícito del usuario, no gap de AN-001) — 2026-08-14
- [x] VS-030 — Editor WYSIWYG (TipTap) para comentario confidencial (reemplaza markdown-lite de VS-028, ver ADR 0006 — trabajo nuevo pedido por el usuario, no gap de AN-001; bug real de foco corregido en el camino, ver CHANGELOG) — 2026-08-07
- [x] VS-029 — Subindicadores directos bajo Dimensión (único de los 5 ítems menores de AN-001 2.ª inspección con cambio de schema — `dimensionId` nullable alternativo + CHECK XOR en `packages/db`, verificado en producción) — 2026-08-06
- [x] VS-028 — Comentario confidencial con formato (markdown-lite sin dependencia nueva, ítem menor de AN-001 2.ª inspección, verificado en producción) — 2026-08-06
- [x] VS-027 — Estado por nodo en el árbol (progreso agregado Dimensión/Indicador, ítem menor de AN-001 2.ª inspección, verificado en producción) — 2026-08-06
- [x] VS-026 — Sub-opciones a 2 niveles (ítem menor de AN-001 2.ª inspección, verificado en producción) — 2026-08-06
- [x] VS-025 — Banner expandible/colapsable (ítem menor de AN-001 2.ª inspección, verificado en producción) — 2026-08-06
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
