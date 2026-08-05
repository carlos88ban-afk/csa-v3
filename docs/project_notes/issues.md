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

### 2026-08-04 - VS-003: Auth + Organización
- **Status**: Completed
- **Description**: Better Auth (plugin `organization`) sobre Neon vía Drizzle, `packages/db` nuevo, primera app Next.js (`apps/web`) con la ruta de auth. 6 tests contra Neon real (registro, login, org/owner, invitación sin email, aceptar invitación, tenant-scoping).
- **Notes**: Dos intentos de delegar la implementación a OpenCode fallaron (cola gratuita saturada, luego proceso colgado) — se implementó directamente. Ver `docs/slices/VS-003.md` para decisiones tomadas durante la implementación y `docs/RISKS.md` R-005/R-006 para los riesgos nuevos (tests contra Neon real, conexión no pooled).

### 2026-08-04 - VS-004: Dominio core CRUD + schema
- **Status**: Completed
- **Description**: Schema Drizzle (framework/dimension/indicator/subindicator) + contratos SDK-first en sdk-core + servicio CRUD tenant-scoped + 8 rutas API en apps/web. 6 tests nuevos contra Neon real (12 en total con VS-003).
- **Notes**: Fusiona VS-004+VS-005 del roadmap original (ver docs/slices/VS-004.md). Bug real encontrado: imports relativos `.js` hacia apps/web/lib fallaban en Turbopack — resuelto con alias `@/*`.

### 2026-08-04 - VS-006: Builder jerárquico (UI)
- **Status**: Completed
- **Description**: Primera UI real: auth (signup/login/logout), organizaciones, y árbol Framework→Dimensión→Indicador→Subindicador con CRUD completo consumiendo las rutas API de VS-004.
- **Notes**: Verificado de punta a punta en Chrome real (no solo tests automatizados) — ver `docs/slices/VS-006.md`. Se corrigió un gap real de `tsconfig.json` (lib DOM faltante) y se añadió un header con logout no especificado originalmente.

### 2026-08-05 - VS-007: Form Engine v1
- **Status**: Completed
- **Description**: Primer motor real (`engine/form`): 7 tipos de elemento v1 (zod discriminated union en sdk-core), Form Editor con autosave (debounce 1500ms) sobre el `formSchema`/`revisionNumber` ya existentes desde VS-004.
- **Notes**: Ver `docs/slices/VS-007.md` y `docs/engines/form.md`. Dos bugs reales de la interacción autosave/validación encontrados y corregidos durante la verificación manual en Chrome (autosave disparándose sin edición del usuario; "Error al guardar" en elementos recién creados). Intento de delegar a OpenCode falló por un problema de entorno (heredoc bash en Windows) — implementado directamente.

### 2026-08-05 - VS-008: Registry de componentes pluggable + versionado
- **Status**: Completed
- **Description**: `engine/components` v1 — registry único (`packages/sdk-core/src/component-registry.ts`) reemplaza metadata de tipo duplicada entre sdk-core y la UI del Builder (VS-007). Cada `FormElement` gana `componentVersion`.
- **Notes**: Ver `docs/slices/VS-008.md` y `docs/engines/components.md`. Bug real de tipos encontrado y corregido: anotar el registry con un tipo explícito ensanchaba los literales y dejaba el chequeo de exhaustividad en compile-time vacío — resuelto con `as const satisfies`. Verificado en navegador real contra producción (no local, a pedido del usuario), incluida confirmación directa en Neon de que `componentVersion` persiste correctamente.

### 2026-08-04 - Análisis de propuesta de stack (OpenCode)
- **Status**: Completed
- **Description**: Se verificaron con búsqueda web las afirmaciones técnicas de la propuesta inicial. Se confirmó R2/Better Auth/Drizzle/Vitest+Playwright sin cambios. Se corrigió: (1) Vercel Hobby prohíbe uso comercial — resuelto confirmando que el proyecto es uso interno; (2) Neon omitía el tope de 100 CU-h/mes — documentado como riesgo monitoreado; (3) Postgres self-hosted en Oracle Cloud Always Free fue considerado pero descartado por recorte de cuota sin previo aviso en jun-2026 — se optó por Neon.
- **Notes**: Detalle completo en `docs/adr/0001-*.md` y `docs/adr/0002-*.md`.
