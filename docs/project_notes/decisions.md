# Decisiones

Las decisiones arquitectónicas formales del stack viven como ADRs en [`docs/adr/`](../adr/) (formato Nygard, una por archivo) — ese es el registro canónico, no se duplica aquí. Este archivo registra decisiones de **proceso y gobierno** que no ameritan una ADR completa.

### 2026-08-04 — Documentación como única fuente de verdad

**Contexto:**
- Proyecto de largo plazo (años); riesgo de que código y documentación diverjan.

**Decisión:**
- Ante cualquier discrepancia entre código y documentación, se corrige primero la documentación, después el código. No se implementa nada sin especificación previa en `docs/`.

**Consecuencias:**
- ✅ El proyecto se puede retomar meses después sin perder contexto (ver `checkpoints/CHECKPOINT.md`).
- ❌ Más disciplina requerida por slice (doc-first añade fricción a cambios rápidos).

### 2026-08-04 — Sistema de memoria en `docs/project_notes/` en vez de `memory/`

**Contexto:**
- Se necesita memoria institucional del proyecto persistente entre sesiones y entre distintas herramientas de IA.

**Decisión:**
- Usar `docs/project_notes/` (bugs, decisions, key_facts, issues) siguiendo el skill `project-memory`, en vez de una carpeta `memory/` separada.

**Alternativas consideradas:**
- Carpeta `memory/` en la raíz → Rechazada: se ve como tooling específico de IA, no como documentación de ingeniería estándar.

**Consecuencias:**
- ✅ Convención reconocible por cualquier desarrollador humano.
- ✅ Se integra naturalmente con el resto de `docs/` (checkpoints, ADRs).
