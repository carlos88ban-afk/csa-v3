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

## Numeración automática (VS-021)

Gap 6 de `../analysis/csa-sp-global-comparison.md`, el último de los 6 gaps aditivos identificados en AN-001: S&P numera automáticamente su árbol (`1`, `1.1`, `1.1.1`) y las preguntas dentro de un sub-cuestionario (`0.1`, `0.2`...). La inspección en vivo del portal (AN-001) fue del **Runtime** de S&P (la vista del evaluado respondiendo), no de su herramienta de administración — por eso el alcance de este gap es exactamente esa paridad visual, no el Builder (ver "Fuera de alcance" abajo).

**Derivada, no persistida** — mismo criterio ya establecido en `../engines/form.md` ("orden del array = orden de presentación, sin campo `order` redundante"): el número de un nodo es su posición (1-based) dentro del array ya ordenado de su nivel, no una columna nueva en `packages/db`. Reordenar (mover una Dimensión, reordenar Elementos) automáticamente renumera sin migración ni endpoint nuevo.

```ts
// packages/sdk-core/src/evaluation.ts
export function dimensionNumber(dimIndex: number): string {
  return String(dimIndex + 1);
}
export function indicatorNumber(dimIndex: number, indIndex: number): string {
  return `${dimensionNumber(dimIndex)}.${indIndex + 1}`;
}
export function subindicatorNumber(dimIndex: number, indIndex: number, subIndex: number): string {
  return `${indicatorNumber(dimIndex, indIndex)}.${subIndex + 1}`;
}
```

La numeración de preguntas (`0.1`, `0.2`...) vive en `../engines/form.md` (junto a `formElement`/`isQuestion`, ver esa sección) porque opera sobre `formSchema.elements`, no sobre la jerarquía Dimensión→Indicador→Subindicador.

### Dónde se calcula y se muestra

Todas las superficies que ya cargan el árbol completo (`EvaluationSnapshot`) lo aplican sin fetches nuevos — es exactamente la razón por la que el snapshot existe (`../engines/publishing.md`):

- **Runtime** (`../engines/persistence.md`): árbol lateral (Dimensión/Indicador/Subindicador numerados), breadcrumb-mini, título del Subindicador activo, label de cada pregunta.
- **Revisión** (`../engines/persistence.md`, VS-018): mismos prefijos, para que un número mencionado en el Runtime sea encontrable ahí sin ambigüedad.
- **Exportación CSV** (`../engines/export.md`): columna `Número` nueva, con el número de la pregunta (`0.N`) — no se numeran las columnas `Dimensión`/`Indicador`/`Subindicador` en sí, ya se identifican por nombre y numerarlas ahí sería redundante con las columnas de texto existentes.

### Fuera de alcance (explícito)

- **Numeración en el Builder** (páginas de Framework/Dimensión/Indicador/Subindicador bajo `apps/web/app/frameworks/...`). Cada página del Builder hoy solo carga su propio nodo + hijos directos — no la posición del nodo entre sus hermanos ni la de sus ancestros (por ejemplo, la página de un Indicador no sabe en qué posición está su Dimensión dentro del Framework). Lograrlo requeriría fetches en cascada de contexto que hoy no se carga, por un beneficio bajo en una pantalla de edición donde el título ya identifica al elemento sin ambigüedad — a diferencia del Runtime/Revisión/Export, que ya tienen el snapshot completo cargado de por sí. Aditivo si se pide más adelante.
- **Persistir el número como campo** — ver "Derivada, no persistida" arriba; ya se descartó explícitamente.

## Nota de alcance: fusión de VS-004 + VS-005

El roadmap original (`../ROADMAP.md`) separaba VS-004 (API tipada) de VS-005 (migraciones DB). En la práctica, unos contratos de API sin persistencia real no son un slice "completamente funcional, probado, integrable" según la metodología del proyecto (`../README.md`) — mismo patrón ya aplicado en VS-003. Se fusionan en un único VS-004 que entrega schema + servicio + API + tests de punta a punta contra Neon real. `../ROADMAP.md` y `../BACKLOG.md` se actualizan para reflejarlo.
