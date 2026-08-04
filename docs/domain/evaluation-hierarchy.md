# Dominio — Jerarquía de evaluación (M2)

Especifica el modelo core: Framework → Dimensión → Indicador → Subindicador (ver `ubiquitous-language.md` para las definiciones conceptuales). Este documento cubre solo la **estructura contenedora**; el motor de formularios (elementos, condiciones, cálculos) que vive dentro de un Subindicador es M4 (VS-007) — fuera de alcance aquí.

## Agregados

### Framework (AR)

- `id`, `organizationId` (obligatorio — tenant-scoping, ver `organization-user.md`), `name`, `description?`, `createdAt`, `updatedAt`.
- Contenedor raíz. No tiene padre.

### Dimension

- `id`, `organizationId`, `frameworkId` → Framework (cascade delete), `title`, `description?`, `createdAt`, `updatedAt`.
- **Invariante:** solo título + descripción. Nunca contiene preguntas ni referencias a elementos.

### Indicator

- `id`, `organizationId`, `dimensionId` → Dimension (cascade delete), `title`, `description?`, `createdAt`, `updatedAt`.
- **Invariante:** igual que Dimension — solo texto de agrupación, nunca preguntas.

### Subindicator

- `id`, `organizationId`, `indicatorId` → Indicator (cascade delete), `title`, `description?`, `formSchema` (jsonb, nullable), `revisionNumber` (entero, default `1`), `createdAt`, `updatedAt`.
- **Invariante (heredada de `ubiquitous-language.md`):** un Subindicador es el único nivel que contiene el formulario real. En M2, `formSchema` existe como columna pero se mantiene `null` — el motor que la puebla con elementos (`engine/form`, `engine/components`) es M4/M5. No se debe escribir lógica de elementos en este slice.
- **Invariante de versionado:** cada `UPDATE` sobre `formSchema` incrementa `revisionNumber` en 1, de forma atómica (no hay "última versión mutable" desde el punto de vista de una Evaluación ya publicada — la publicación, M6, apuntará a un `revisionNumber` concreto). En M2 esto solo aplica al campo `formSchema`; cambios de `title`/`description` no incrementan la revisión.

## Invariante transversal: tenant-scoping (reafirma `organization-user.md`)

Las cuatro tablas llevan `organizationId` de forma **denormalizada** (no solo vía join ascendente) para que cada query pueda filtrar directamente sin recorrer la jerarquía completa. Toda operación de escritura debe validar, además de la sesión activa, que el recurso padre referenciado (`frameworkId`, `dimensionId`, `indicatorId`) pertenece **a la misma organización** — evita que un miembro cree, por ejemplo, un Indicador colgando de una Dimensión de otra Organización aunque adivine su ID.

## Autorización (M2 — mínima, RBAC completo es M11)

Cualquier `member` u `owner` de la Organización activa puede crear/leer/actualizar/borrar dentro de su propia organización. No hay distinción de permisos por rol todavía (eso es `engine/permission`, M11/VS-014) — se documenta aquí para que quede explícito que la ausencia de reglas más finas es intencional, no un descuido.

## Operaciones (CRUD) requeridas para VS-004

Para cada uno de los 4 agregados: crear, leer uno, listar (por padre — ej. "listar Dimensiones de un Framework"), actualizar, borrar (cascade hacia hijos). Sin paginación todavía (volumen esperado bajo con ~20 usuarios; se añade si hace falta, no especulativamente).

## Nota de alcance: fusión de VS-004 + VS-005

El roadmap original (`../ROADMAP.md`) separaba VS-004 (API tipada) de VS-005 (migraciones DB). En la práctica, unos contratos de API sin persistencia real no son un slice "completamente funcional, probado, integrable" según la metodología del proyecto (`../README.md`) — mismo patrón ya aplicado en VS-003. Se fusionan en un único VS-004 que entrega schema + servicio + API + tests de punta a punta contra Neon real. `../ROADMAP.md` y `../BACKLOG.md` se actualizan para reflejarlo.
