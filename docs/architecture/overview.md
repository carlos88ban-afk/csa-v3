# Arquitectura — Overview

## Estilo: Monolito Modular

No microservicios. Con ~20 usuarios concurrentes (NFR-1), el costo de infraestructura y operación de microservicios no se justifica. Los módulos internos están desacoplados (alta cohesión / bajo acoplamiento) para permitir extraer servicios en el futuro si el proyecto crece, sin reescritura completa.

```
┌────────────────────────────────────────────────────────┐
│  APLICACIÓN FULL-STACK (Next.js / TypeScript)          │
│  ┌─────────── BUILDER (edición) ──────────┐             │
│  │  Framework → Dimensión → Indicador →   │             │
│  │  Subindicador → Form Editor → Elementos│             │
│  └────────────────────────────────────────┘             │
│  ┌─────────── RUNTIME (respuesta) ───────┐             │
│  │  Render de formularios + autosave      │             │
│  └────────────────────────────────────────┘             │
│  ┌─ SDK FIRST (contratos tipados compartidos) ───────┐  │
└──────────┬────────────────────────┬─────────────────────┘
           │                        │
   ┌───────▼───────┐        ┌────────▼───────┐
   │ PostgreSQL    │        │  Cloudflare R2 │  (S3-compatible)
   │ (Neon +       │        │  (S3 API)      │
   │  Drizzle)     │        └────────────────┘
   └───────────────┘
```

## Módulos internos (`packages/`)

- `sdk-core` — contratos TypeScript compartidos; única fuente de tipos entre Builder, Runtime y API.
- `engine/form` — orquestación de formularios por metadatos.
- `engine/formula` — componentes calculados (parser/evaluador de expresiones aritméticas a mano, sin librería).
- `engine/rule` — visibilidad condicional (`visibleIf` sobre cualquier Elemento).
- `engine/validation` — validación sync/async/cross-field.
- `engine/permission` — RBAC (dueño / editor / evaluador; gate de escritura sobre `member.role`, sin `access-control` custom de Better Auth).
- `engine/components` — registry de componentes (arquitectura de plugins).
- `engine/publishing` — publicación, versionado y share links.
- `engine/persistence` — esquema de respuestas (JSONB schema-aware) + integración R2.
- `engine/export` — exportación básica de resultados (CSV).

Cada motor se documenta en [`../engines/`](../engines/) antes de implementarse (regla doc-first).

## Principios aplicados

Metadata Driven Architecture · Configuration over Code · Component Based Architecture · SDK First · Event Driven donde aporte valor · alta cohesión · bajo acoplamiento · extensibilidad · reutilización · versionado · i18n futura · WCAG 2.2 AA · diseño orientado a plugins. Ningún motor ni componente se desarrolla para un framework de evaluación específico — todo es reutilizable entre ESG, CSA, ISO, auditorías, etc.

## Stack técnico

Ver [`stack.md`](stack.md) para la selección justificada, y [`../adr/`](../adr/) para las decisiones formales.
