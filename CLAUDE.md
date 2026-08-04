# Plataforma CSA — Constructor de Evaluaciones Empresariales

## Regla rectora

`docs/` es la **única fuente de verdad** del proyecto. Ante cualquier discrepancia entre código y documentación, se corrige primero la documentación, después el código. No se implementa nada sin especificación previa en `docs/`. Ver `docs/README.md` para el mapa completo.

Cada vertical slice cierra únicamente cuando: tests ✅, typecheck ✅, docs actualizadas ✅, changelog ✅, checkpoint ✅, backlog ✅ (`pnpm slice:close`).

## Antes de retomar trabajo

Leer, en orden: `docs/checkpoints/CHECKPOINT.md` → `docs/BACKLOG.md` → `docs/ROADMAP.md`.

## Project Memory System

Este proyecto mantiene conocimiento institucional en `docs/project_notes/` para dar consistencia entre sesiones.

### Archivos de memoria

- **bugs.md** - registro de bugs con fecha, causa raíz, solución y prevención
- **decisions.md** - decisiones de proceso/gobierno (las decisiones arquitectónicas formales viven en `docs/adr/`, no aquí)
- **key_facts.md** - configuración del proyecto, stack, límites de free tier, URLs
- **issues.md** - registro rápido de trabajo completado por slice

### Protocolos

**Antes de proponer cambios arquitectónicos:**
- Revisar `docs/adr/` (decisiones formales) y `docs/project_notes/decisions.md` (decisiones de proceso).
- Si el cambio propuesto contradice una ADR aceptada, no editarla: crear una nueva ADR que la supersede.

**Al encontrar errores o bugs:**
- Buscar en `docs/project_notes/bugs.md` por problemas similares antes de investigar desde cero.
- Documentar bugs nuevos y su solución al resolverlos.

**Al necesitar configuración del proyecto:**
- Revisar `docs/project_notes/key_facts.md` (stack, límites de free tier, estructura del monorepo).
- Nunca hay credenciales en este archivo — están en `.env` (no versionado).

**Al completar trabajo de un slice:**
- Registrar en `docs/project_notes/issues.md`, `docs/CHANGELOG.md` y `docs/checkpoints/CHECKPOINT.md`.

### Estilo

Listas con viñetas, entradas concisas (1-3 líneas), siempre con fecha. Limpieza manual periódica de entradas antiguas (no automatizada).
