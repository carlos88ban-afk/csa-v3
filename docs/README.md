# Documentación — Índice

Esta carpeta es la **única fuente de verdad** del proyecto. Si el código y la documentación discrepan, se corrige primero la documentación y después el código. No se implementa nada sin especificación previa aquí.

## Mapa

| Carpeta/archivo | Contenido |
|---|---|
| [`VISION.md`](VISION.md) | Por qué existe el proyecto |
| [`OBJECTIVES.md`](OBJECTIVES.md) | Objetivos medibles |
| [`SCOPE.md`](SCOPE.md) | Qué está dentro y fuera de alcance |
| [`ROADMAP.md`](ROADMAP.md) | Milestones M0–M12 |
| [`BACKLOG.md`](BACKLOG.md) | Trabajo pendiente priorizado |
| [`RISKS.md`](RISKS.md) | Riesgos activos y mitigaciones |
| [`TECH_DEBT.md`](TECH_DEBT.md) | Deuda técnica aceptada conscientemente |
| [`CHANGELOG.md`](CHANGELOG.md) | Historial de cambios por slice |
| [`domain/`](domain/) | Lenguaje ubicuo, agregados, invariantes |
| [`architecture/`](architecture/) | Overview, stack, requisitos no funcionales |
| [`adr/`](adr/) | Decisiones arquitectónicas (Architecture Decision Records) |
| [`engines/`](engines/) | Diseño de los motores (form, formula, rule, validation, permission, components) |
| [`api/`](api/) | Contratos de API |
| [`database/`](database/) | Esquema, migraciones, ERD |
| [`playbooks/`](playbooks/) | Cómo operar builder, runtime, publishing, persistencia, permisos |
| [`checkpoints/`](checkpoints/) | Estado retomable del proyecto (Checkpoint Manager) |
| [`slices/`](slices/) | Plan y cierre de cada vertical slice |
| [`project_notes/`](project_notes/) | Memoria: bugs, decisiones, hechos clave, issues |

## Regla rectora

1. Analiza → 2. Diseña → 3. Documenta → 4. Registra la decisión (ADR si aplica) → 5. Solo entonces implementa.

Cada slice cierra únicamente cuando: tests ✅, typecheck ✅, docs actualizadas ✅, changelog ✅, checkpoint ✅, backlog ✅.
