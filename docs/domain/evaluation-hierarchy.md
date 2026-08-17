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

### Fuera de alcance (explícito) — SUPERADO por VS-049, ver más abajo

- ~~**Numeración en el Builder**~~ — implementado en VS-049 ("Numeración y orden persistido en el Builder", más abajo). El Builder de VS-006/VS-031 (`apps/web/app/frameworks/[frameworkId]/builder/page.tsx`) ya carga el árbol completo por Framework en un solo fetch en cascada (a diferencia de las páginas legadas por nodo individual a las que se refería este párrafo originalmente) — el argumento de "requeriría fetches en cascada que hoy no se carga" ya no aplica.
- ~~**Persistir el número como campo**~~ — VS-049 persiste el **orden** (no el número en sí, que sigue siendo derivado de la posición) como columna nueva — ver justificación abajo.

*(Párrafo original, sin editar, como registro histórico de la decisión que se supera):*

- **Numeración en el Builder** (páginas de Framework/Dimensión/Indicador/Subindicador bajo `apps/web/app/frameworks/...`). Cada página del Builder hoy solo carga su propio nodo + hijos directos — no la posición del nodo entre sus hermanos ni la de sus ancestros (por ejemplo, la página de un Indicador no sabe en qué posición está su Dimensión dentro del Framework). Lograrlo requeriría fetches en cascada de contexto que hoy no se carga, por un beneficio bajo en una pantalla de edición donde el título ya identifica al elemento sin ambigüedad — a diferencia del Runtime/Revisión/Export, que ya tienen el snapshot completo cargado de por sí. Aditivo si se pide más adelante.
- **Persistir el número como campo** — ver "Derivada, no persistida" arriba; ya se descartó explícitamente.

## Numeración y orden persistido en el Builder (VS-049, implementado 2026-08-17)

Pedido explícito del usuario: que el panel de navegación del Builder (admin editando) muestre el mismo número que ve el evaluado (`1`, `1.1`, `1.1.1`), y que pueda reordenar Dimensión/Indicador/Subindicador con drag-and-drop.

### Por qué se supera "Derivada, no persistida"

La decisión original (arriba, VS-021) asumía que el **orden de presentación** siempre viene gratis del orden del array que ya devuelve la query — válido mientras nadie necesitara *elegir* ese orden explícitamente. Drag-and-drop es exactamente eso: el admin elige un orden que no tiene por qué coincidir con el orden de creación (`createdAt`) ni con ningún otro criterio derivable. Sin una columna persistida no hay dónde guardar esa elección. El **número que se muestra** (`1.1`, `1.1.1`) sigue siendo 100% derivado de la posición (0-based) dentro del array ya ordenado — no se persiste un string "1.1" en ningún lado, solo la posición vía la nueva columna `order`. Mismas funciones puras de siempre (`dimensionNumber`/`indicatorNumber`/`subindicatorNumber`/`directSubindicatorNumber`, sin cambios), ahora aplicadas también en el Builder importándolas de `packages/sdk-core/src/evaluation.ts` en vez de una copia local desactualizada que además tenía un bug (`directSubindicatorNumber` local en `builder/page.tsx` calculaba 3 niveles en vez de 2 — nunca se notó porque nunca estaba conectada al render del árbol, solo a breadcrumbs de búsqueda).

### Schema (`packages/db/src/schema/domain.ts`)

```ts
export const dimension = pgTable("dimension", {
  // ...campos existentes...
  order: integer("order").notNull().default(0),
});
// mismo campo `order` en indicator y subindicator
```

- `order` es un entero por-padre (no global): dentro de un Framework, cada Dimensión tiene su propio `order` 0-based; dentro de una Dimensión, cada Indicador el suyo; dentro de un Indicador, cada Subindicador el suyo; los Subindicadores directos de una Dimensión (VS-029) tienen su propio `order` independiente del de los Indicadores de esa misma Dimensión (mismo criterio ya establecido de "sin caso mixto intercalado" — reordenar nunca mezcla Indicadores con Subindicadores directos entre sí, cada lista se reordena por separado).
- Backfill de filas existentes (todas de prueba, sin evaluaciones reales — mismo criterio ya usado en VS-048): `order` asignado por posición dentro de `ORDER BY created_at ASC, id ASC` de cada grupo padre, vía script one-off ejecutado una sola vez tras el `db:push` (no un archivo de migración versionado — este proyecto usa `drizzle-kit push`, ver TD-001).

### `packages/sdk-core`

- `Dimension`/`Indicator`/`Subindicator` (interfaces en `domain.ts`) ganan `order: number`.
- Nuevo `reorderInput = z.object({ orderedIds: z.array(z.string().min(1)).min(1) })` — reusado por los 3 endpoints de reorder (el `parentId` que acota el alcance del reorder viaja en la URL/query, no en el body).

### `packages/db/src/domain/service.ts`

- `listDimensions`/`listIndicators`/`listSubindicators`/`listDirectSubindicators`: ganan `.orderBy(tabla.order)`.
- `createDimension`/`createIndicator`/`createSubindicator`: calculan el próximo `order` como `COALESCE(MAX(order), -1) + 1` dentro del mismo padre (una fila nueva siempre va al final, coherente con "+" al final de la lista en el resto del Builder — VS-047/048 ya usan ese mismo criterio para agregar columnas/filas).
- Nuevas `reorderDimensions(organizationId, frameworkId, orderedIds)`, `reorderIndicators(organizationId, dimensionId, orderedIds)`, `reorderSubindicators(organizationId, parentId, parentKind, orderedIds)` (`parentKind: "indicator" | "dimension"` para distinguir subindicadores bajo Indicador vs. directos bajo Dimensión) — cada una, dentro de una transacción: valida que todos los `orderedIds` pertenezcan al padre y organización indicados (mismo criterio de tenant-scoping que el resto del dominio — nunca confiar en que el cliente mandó IDs válidos), y hace `UPDATE ... SET order = <índice> WHERE id = <id>` por cada uno.

### API (`apps/web`)

Tres endpoints nuevos, todos `requireWriteAccess` (mismo nivel que crear/editar/borrar):

- `POST /api/dimensions/reorder?frameworkId=<id>` — body `{ orderedIds }`.
- `POST /api/indicators/reorder?dimensionId=<id>` — body `{ orderedIds }`.
- `POST /api/subindicators/reorder?indicatorId=<id>` **o** `?dimensionId=<id>` (uno de los dos, mismo criterio XOR que el resto de Subindicador) — body `{ orderedIds }`.

### Builder (`apps/web/app/frameworks/[frameworkId]/builder/page.tsx`)

- Cada fila del árbol (Dimensión/Indicador/Subindicador, incluidos los directos) muestra su número antes del título, usando las funciones importadas de `sdk-core` sobre el índice ya conocido (`di`/`ii`/`si`) del `.map()` que ya arma el árbol — sin fetch nuevo, el índice del array YA es la fuente del número (coherente con "derivada, no persistida": lo persistido es el `order` de la fila, el número se sigue derivando en cada render).
- Drag-and-drop nativo (HTML5 `draggable`/`onDragStart`/`onDragOver`/`onDrop`, sin librería nueva — mismo criterio ya usado en `../engines/form.md` para justificar botones ↑/↓ en vez de una librería de dnd para reordenar Elementos dentro de un Subindicador; acá se logra drag-and-drop real sin librería porque el navegador ya lo provee nativamente). Cada nivel solo acepta soltar dentro de la misma lista de hermanos (no se puede arrastrar un Indicador fuera de su Dimensión ni una Dimensión fuera del Framework) — reordenar, no reparentar (reparentar sigue fuera de alcance, ver VS-029 "Fuera de alcance"). Al soltar: reordena el estado local de inmediato (optimista) y llama al endpoint de reorder correspondiente; si falla, revierte el estado local y muestra el error en `treeMessage` (mismo patrón que crear/renombrar/borrar).
- **Corrección de un bug preexistente encontrado al tocar este render**: `d.directSubs.map(...)` vivía dentro del `.map()` de `d.indicators`, así que los Subindicadores directos de una Dimensión se renderizaban duplicados una vez por cada Indicador de esa Dimensión (invisible en la práctica porque ninguna Dimensión de prueba tenía Indicadores Y directos a la vez simultáneamente con más de un Indicador). Se mueve a un bloque hermano después del `.map()` de Indicadores, una sola vez por Dimensión — coherente con la convención de numeración ya documentada ("Indicadores primero, luego directos, sin intercalar").

### Navegación: framework list → Builder directo

Pedido explícito del usuario: saltar la pantalla intermedia `/frameworks/[frameworkId]` (que solo mostraba la tabla de Dimensiones + un botón "Abrir editor" separado) — confusa por tener dos pantallas distintas para lo mismo. `apps/web/app/frameworks/page.tsx`: el link de cada framework en la lista pasa de `href="/frameworks/${fw.id}"` a `href="/frameworks/${fw.id}/builder"`. La página `/frameworks/[frameworkId]` **no se elimina** — sigue siendo necesaria para "Publicación" (publicar, listar evaluaciones, revisar, exportar CSV, revocar), funcionalidad que no vive en el Builder — sigue alcanzable desde el breadcrumb "Framework" que el Builder ya tenía (`apps/web/app/frameworks/[frameworkId]/builder/page.tsx`, link `{ label: "Framework", href: `/frameworks/${frameworkId}` }`).

### Fuera de alcance (explícito)

- **Reordenar entre Frameworks** (mover una Dimensión de un Framework a otro) — sigue sin UI, no pedido.
- **Reparentar** (mover un Indicador a otra Dimensión, un Subindicador a otro Indicador) — sigue fuera de alcance (VS-029), reordenar ≠ reparentar.
- **Intercalar Indicadores y Subindicadores directos en una misma lista ordenable** — cada lista (Indicadores, directos) se reordena por separado, mismo criterio "sin caso mixto" ya documentado.
- **Migraciones versionadas de Drizzle** para el backfill de `order` — sigue como TD-001/TD-002, backfill de este slice es un script one-off descartable (sin datos reales que migrar, confirmado con el usuario en VS-048).

### Bug real encontrado en la verificación en producción: burbujeo de eventos entre niveles anidados

Un Indicador vive DENTRO del `div` arrastrable de su Dimensión (misma anidación para Subindicador dentro de Indicador). La primera versión de los handlers no cortaba la propagación del evento nativo — al arrastrar un Indicador, el `dragstart`/`drop` burbujeaba hasta el `div` arrastrable de la Dimensión contenedora, que también tiene su propio `onDragStart`/`onDragOver`/`onDrop`; el handler del ancestro se ejecutaba después durante el burbujeo y pisaba `dragScope` con sus propios datos. El resultado: arrastrar un Indicador (o un Subindicador) no reordenaba nada, sin ningún error visible — el `onDrop` del nivel correcto terminaba llamando a `moveIndicator`/`moveSub` con el id de la Dimensión, que no calzaba con ningún hijo y no hacía nada.

**Fix**: `e.stopPropagation()` en los 3 handlers (`onDragStart`/`onDragOver`/`onDrop`) de cada nivel, más una verificación explícita de `dragScope.scope` dentro de cada `onDrop` antes de actuar (antes solo se verificaba en `onDragOver` vía `allowDrop`, que no bloqueaba `onDrop` si el navegador igual disparaba el evento). Commit `a9c02f8`, separado del commit principal de VS-049 (`6779307`) porque se encontró recién al verificar en producción — mismo criterio del resto del proyecto: un hallazgo de verificación se corrige y se documenta, no se esconde dentro del commit original.

### Verificación en producción (2026-08-17)

Commit `6779307` (+ fix `a9c02f8`) desplegados a `csa-v3-web.vercel.app`. Framework temporal "TEMP - VS-049 verificacion" (creado y **borrado al terminar**): clic en un framework desde `/frameworks` llevó directo a `/builder`, sin la pantalla intermedia. Árbol con 2 Dimensiones (cada una con 2 Indicadores en un caso) mostró la numeración `1`, `2`, `1.1`, `1.2` correctamente. Drag-and-drop de Dimensiones e Indicadores probado disparando una secuencia real de `DragEvent` vía JS (el automatizador de navegador de esta sesión no puede simular el gesto nativo de arrastre con mouse sintético; el navegador de un usuario real sí lo hace de punta a punta con el mismo código) — encontró el bug de burbujeo de arriba, se corrigió, y tras el fix ambos niveles reordenaron correctamente y **persistieron tras recarga completa desde cero** en ambos casos.

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
