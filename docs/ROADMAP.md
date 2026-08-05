# Roadmap

Cada milestone es lanzable por sí mismo. El producto es usable (de forma incompleta pero real) desde M2/M4.

| Milestone | Entregable | Slices |
|---|---|---|
| M0 | Gobernanza, repositorio, CI, Checkpoint Manager | VS-001, VS-002 |
| M1 | Auth + Organización (tenant) | VS-003 |
| M2 | Modelo core (Framework→Dimensión→Indicador→Subindicador) CRUD + schema DB | VS-004¹ |
| M3 | Builder jerárquico (árbol simple) | VS-006 |
| M4 | Form Engine v1 (elementos básicos + validación + autosave) | VS-007 |
| M5 | Registry de componentes pluggable + versionado | VS-008 |
| M6 | Publicación + enlaces seguros | VS-009 |
| M7 | Runtime de respuesta + guardar progreso | VS-010 |
| M8 | Evidencias (uploads → R2) | VS-011 |
| M9 | Exportación de resultados | VS-012 |
| M10 | Motores: fórmula + reglas condicionales | VS-013 |
| M11 | Permisos (RBAC) | VS-014 |
| M12 | i18n + WCAG 2.2 AA + polish | VS-015+ |

¹ VS-005 (migraciones DB) se fusionó dentro de VS-004 el 2026-08-04 — ver `domain/evaluation-hierarchy.md`, nota de alcance (mismo patrón que VS-003: un slice sin persistencia real no es funcional/probado de punta a punta).

Estado actual: **M0–M6 completados** (M2 y M3 fusionaron sus slices originales en unidades funcionales, ver notas al pie), **M7 siguiente** — ver `checkpoints/CHECKPOINT.md`.
