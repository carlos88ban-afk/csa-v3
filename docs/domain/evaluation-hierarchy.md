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

## Subindicadores directos bajo Dimensión (VS-029)

Ajuste menor de `../analysis/csa-sp-global-comparison.md` ("Segunda inspección"), el único de los 5 hallazgos menores de AN-001 2.ª inspección con cambio de schema: el portal S&P permite que un sub-cuestionario (Subindicador) cuelgue **directo de una Dimensión, sin Indicador intermedio** — observado en `0.1` ("Denominator - Revenues", bajo la dimensión `0 Company Information`) y en los `5.x` (dimensión `5 Feedback Survey`). Hoy `subindicator.indicatorId` es `NOT NULL` en `packages/db/src/schema/domain.ts` — la jerarquía está fijada rígidamente a 3 niveles, sin esta salida.

### Decisión de diseño: `dimensionId` opcional alternativo, no Indicador opcional en el medio

Se agrega una columna `dimensionId` (nullable) a `subindicator`, y `indicatorId` pasa a nullable — **exactamente uno de los dos debe estar presente** (invariante XOR), nunca ambos ni ninguno. Se descarta la alternativa de "Indicador opcional en el medio de la jerarquía siempre" porque cambiaría la semántica de Indicador en todos los casos existentes (¿qué significa un Indicador sin título ni Subindicadores?); un Subindicador con un padre alternativo explícito es un cambio más acotado y reversible.

```ts
// packages/db/src/schema/domain.ts
export const subindicator = pgTable(
  "subindicator",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    indicatorId: text("indicator_id").references(() => indicator.id, { onDelete: "cascade" }), // ya no notNull()
    dimensionId: text("dimension_id").references(() => dimension.id, { onDelete: "cascade" }), // nuevo, nullable
    title: text("title").notNull(),
    description: text("description"),
    formSchema: jsonb("form_schema"),
    revisionNumber: integer("revision_number").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    index("subindicator_organizationId_idx").on(table.organizationId),
    index("subindicator_indicatorId_idx").on(table.indicatorId),
    index("subindicator_dimensionId_idx").on(table.dimensionId),
    check("subindicator_parent_xor", sql`(indicator_id IS NOT NULL) <> (dimension_id IS NOT NULL)`),
  ],
);
```

El `CHECK` a nivel Postgres es la fuente de verdad del invariante (no se puede insertar una fila inválida ni evitando la capa de servicio) — igual criterio que el resto del dominio (tenant-scoping vía `organizationId`, cascade delete): las invariantes estructurales viven en el schema, no solo en zod/TypeScript.

### `packages/sdk-core`

```ts
// domain.ts
export const createSubindicatorInput = z
  .object({
    indicatorId: z.string().min(1).optional(),
    dimensionId: z.string().min(1).optional(),
    title: z.string().min(1),
    description: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (!!val.indicatorId === !!val.dimensionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Debe especificar exactamente uno de indicatorId o dimensionId",
        path: ["indicatorId"],
      });
    }
  });

export interface Subindicator {
  id: string;
  organizationId: string;
  indicatorId: string | null;
  dimensionId: string | null;
  title: string;
  description: string | null;
  formSchema: FormSchema | null;
  revisionNumber: number;
  createdAt: Date;
  updatedAt: Date;
}
```

`evaluation.ts` — `EvaluationSnapshot` gana el campo directo en Dimensión:

```ts
const evaluationSnapshotDimension = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  indicators: z.array(evaluationSnapshotIndicator),
  subindicators: z.array(evaluationSnapshotSubindicator), // nuevo: directos, sin Indicador
});
```

### Numeración: convención "Indicadores primero, luego directos", sin caso mixto observado

`subindicatorNumber(dimIndex, indIndex, subIndex)` (VS-021) no cambia — sigue sirviendo a los Subindicadores bajo Indicador. Nueva función para directos:

```ts
// packages/sdk-core/src/evaluation.ts
export function directSubindicatorNumber(dimIndex: number, indicatorCount: number, subIndex: number): string {
  return `${dimensionNumber(dimIndex)}.${indicatorCount + subIndex + 1}`;
}
```

**Convención deliberada, no observada en un caso real mixto**: si una Dimensión tuviera Indicadores *y* Subindicadores directos a la vez (S&P no mostró ese caso — cada Dimensión inspeccionada tiene uno u otro, nunca ambos), los directos se numeran **después** de todos los Indicadores (`indicatorCount + subIndex + 1`), no intercalados por orden de creación. Es una simplificación deliberada (YAGNI, `CLAUDE.md`) — si aparece un caso real mixto que necesite intercalado, es aditivo (requeriría una posición compartida entre ambos tipos, hoy no existe).

### `packages/db/src/domain/service.ts`

`createSubindicator` recibe el input ya validado (XOR) y arma el `insert` con el campo que corresponda (el otro queda `null` explícito). Valida el padre correcto según cuál esté presente (`getIndicator` o `getDimension`, mismo criterio de tenant-scoping que ya existe). `listSubindicators` gana una segunda firma/variante por `dimensionId` (además de la existente por `indicatorId`) — mismo patrón de query, columna de filtro distinta.

`packages/db/src/domain/evaluation-service.ts`, `buildSnapshot`: gana una cuarta query por Dimensión (`where subindicator.dimensionId = dim.id`, análoga a la de Indicador→Subindicador ya existente), poblando el nuevo campo `dim.subindicators` del snapshot.

### API (`apps/web`)

- `apps/web/app/api/subindicators/route.ts`: `GET` acepta `dimensionId` **o** `indicatorId` como query param (uno de los dos, ya no solo `indicatorId`); `POST` delega la validación XOR a `createSubindicatorInput`.
- Rutas de update/delete por id (`apps/web/app/api/subindicators/[id]/route.ts`) no cambian — operan por `id`, agnósticas de qué tipo de padre tiene esa fila.

### Builder

Nueva sección "Subindicadores directos" en la página de Dimensión (`apps/web/app/frameworks/[frameworkId]/dimensions/[dimensionId]/page.tsx`), paralela a "Indicadores", con su propio formulario de creación (`dimensionId` en vez de `indicatorId`). Nueva ruta de Form Editor `apps/web/app/frameworks/[frameworkId]/dimensions/[dimensionId]/subindicators/[subindicatorId]/page.tsx` — mismo componente/lógica que la ruta existente bajo Indicador (`.../indicators/[indicatorId]/subindicators/[subindicatorId]/page.tsx`, `engines/form.md` → UI Builder), solo cambia el breadcrumb (sin el eslabón "Indicador") y el origen del `dimensionId` en vez de `indicatorId` para la creación.

### Runtime (`../engines/persistence.md`)

Árbol de navegación: bajo cada Dimensión, junto a `dim.indicators.map(...)`, se agrega `dim.subindicators.map(...)` (directos) como botones al mismo nivel visual que un Subindicador normal (sin agrupador Indicador de por medio) — mismo `tree-dot`/clickeable/`activeId` que ya tienen los Subindicadores bajo Indicador. `flatten()` gana los directos (con `indId` ahora opcional en `FlatSubindicator`). `dimensionProgress` (VS-027) se actualiza para sumar también `dim.subindicators`, no solo `dim.indicators`.

### Página de Revisión y Exportación CSV

Mismo patrón: iteran también `dim.subindicators` directos junto a `dim.indicators`. En el CSV (`export.md`), la columna `Indicador` queda vacía (`""`) para las filas de un Subindicador directo — no se rediseña el header, una celda vacía ya comunica "no aplica" sin ambigüedad (mismo criterio que celdas vacías por "sin responder" en el resto del CSV).

### Fuera de alcance (explícito)

- **Numeración intercalada Indicador/directo por orden real** — ver "convención deliberada" arriba.
- **Mover un Subindicador existente entre Indicador y Dimensión directa** (o viceversa) — se crea nuevo en el lugar que corresponda; no hay UI de "reparentar". Aditivo si se pide.
- **Indicador sin ningún Subindicador (grupo vacío) como caso especial** — ya es válido hoy (una Dimensión puede tener un Indicador sin Subindicadores todavía), sin cambios de este slice.

## Nota de alcance: fusión de VS-004 + VS-005

El roadmap original (`../ROADMAP.md`) separaba VS-004 (API tipada) de VS-005 (migraciones DB). En la práctica, unos contratos de API sin persistencia real no son un slice "completamente funcional, probado, integrable" según la metodología del proyecto (`../README.md`) — mismo patrón ya aplicado en VS-003. Se fusionan en un único VS-004 que entrega schema + servicio + API + tests de punta a punta contra Neon real. `../ROADMAP.md` y `../BACKLOG.md` se actualizan para reflejarlo.
