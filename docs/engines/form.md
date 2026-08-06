# Motor: `engine/form` (v1 — M4/VS-007)

Orquestación de formularios por metadatos (`../architecture/overview.md`). Responsabilidad de este motor: definir la **forma** del `formSchema` (jsonb) que vive en cada Subindicador (`../domain/evaluation-hierarchy.md`) y las reglas para leerlo/escribirlo. No incluye render de Runtime para evaluados (M7), ni componentes pluggable/versionados (`engine/components`, M5), ni fórmulas/condicionales (`engine/formula`/`engine/rule`, M10).

## Alcance v1

- Editor (Builder) de la lista de Elementos de un Subindicador: crear, editar, reordenar, borrar.
- Autosave del `formSchema` mientras se edita.
- Validación **estructural** del `formSchema` (que el JSON tenga forma válida) vía zod en `sdk-core`, punto único de verdad para Builder y API (principio SDK-first).
- Cada Elemento puede declarar reglas de validación de **contenido** (`required`, `maxLength`, `min`/`max`, etc.) como metadatos — el motor v1 las *define y persiste*, no las *ejecuta* (no hay Runtime de respuesta todavía, eso es M7/`engine/persistence`).

## Fuera de alcance (explícito)

- Render del formulario para un evaluado respondiendo (Runtime) — M7 (VS-010).
- Tipos de elemento que dependen de otros motores todavía no construidos: `tabla`, `grid`, `upload`, `evidencia` (necesitan R2 / `engine/components`, M5/M8), `calculado` (`engine/formula`, M10), `condicional` (`engine/rule`, M10).
- Registry de componentes pluggable/versionado (`engine/components`) — v1 tiene un set fijo de tipos de elemento en código, no un registry externo.
- Ejecución de las reglas de validación de contenido sobre una respuesta real — solo se definen y se guardan.
- Colaboración en tiempo real (múltiples editores simultáneos sobre el mismo Subindicador) — fuera de alcance dado NFR-1 (~20 usuarios concurrentes, no necesariamente editando el mismo formulario a la vez). Sin lock ni resolución de conflictos; último autosave gana.

## Tipos de elemento v1

Subconjunto de `../domain/ubiquitous-language.md` (fila "Elemento") que no depende de motores futuros: **pregunta** (en sus variantes de texto/número/selección), **instrucción**, **banner**, **texto**. El resto (`tabla`, `grid`, `upload`, `URL`, `evidencia`, `calculado`, `repetible`, `condicional`) queda pendiente para M5/M8/M10.

| `type` | Uso | Config propia |
|---|---|---|
| `texto_corto` | Pregunta de respuesta corta (input de una línea) | `maxLength?: number` |
| `texto_largo` | Pregunta de respuesta larga (textarea) | `maxLength?: number` |
| `numero` | Pregunta numérica | `min?: number`, `max?: number`, `unit?: string`, `availableUnits?: string[]` — ver "Unidad por campo numérico" |
| `seleccion_unica` | Pregunta de opción única (radio) | `options: {id, label, subOptions?}[]` — ver "Opciones anidadas" |
| `seleccion_multiple` | Pregunta de opción múltiple (checkbox) | `options: {id, label, subOptions?}[]`, `minSelected?`, `maxSelected?` — ver "Opciones anidadas" |
| `seleccion_desplegable` | Pregunta de opción única (dropdown) | `options: {id, label, subOptions?}[]` — ver "Select dropdown" |
| `instruccion` | Texto informativo, no captura respuesta | — |
| `banner` | Aviso destacado, no captura respuesta | `variant: "info" \| "warning"` |
| `url_publica` | Pregunta de referencias URL públicas (máx. N) | `maxUrls?: number` — ver "Campo URL pública" |

Campos base compartidos por todo elemento:

- `id: string` — UUID generado en cliente al crear el elemento. Estable entre ediciones; el Runtime futuro (M7) lo usará para mapear respuestas a elementos, por eso no se recicla ni se basa en el índice del array.
- `type: <tabla anterior>`
- `label: string` — texto de la pregunta/instrucción/banner. **Permite vacío a propósito**: el autosave guarda el formulario mientras se edita (un elemento recién agregado empieza con `label: ""`), no solo su estado terminado. Que todo elemento tenga label no-vacío es una validación de "¿está listo para publicarse?" que pertenece a `engine/publishing` (M6), no una condición para poder guardar un borrador.
- `helpText?: string` — solo aplica a tipos "pregunta" (no a `instruccion`/`banner`).
- `required?: boolean` — solo aplica a tipos "pregunta".

## Estructura del Form Schema

```ts
interface FormSchema {
  schemaVersion: 1;   // versión del *formato* JSON — permite migrarlo en el futuro (M5+) sin tocar revisionNumber
  elements: FormElement[]; // orden del array = orden de presentación; sin campo `order` redundante
}
```

`schemaVersion` es independiente de `revisionNumber` (columna en `subindicator`, ya implementada en VS-004): `revisionNumber` cuenta ediciones de contenido; `schemaVersion` versiona la forma del JSON en sí. No se espera que `schemaVersion` cambie en v1 — se documenta ahora para no tener que migrar datos existentes cuando aparezca `schemaVersion: 2`.

## Opciones anidadas (VS-016)

Gap 1 de `../analysis/csa-sp-global-comparison.md`: en el portal S&P Global CSA, elegir una opción de un radio/checkbox puede desplegar su propio sub-checklist (ej. elegir "Sí" en una pregunta despliega 3 sub-opciones de detalle). Se implementa como una extensión aditiva de `formOption`, no un tipo de Elemento nuevo.

**Un solo nivel de anidamiento** — decisión explícita de alcance: la inspección en vivo del portal S&P no mostró un tercer nivel (sub-sub-opciones), así que `subOptions` no es recursivo. Si aparece un caso real de 2 niveles de anidamiento, es un cambio aditivo (`subOptions[].subOptions?`), no un rediseño.

```ts
const formOption = z.object({
  id: z.string().min(1),
  label: z.string(),
  subOptions: z.array(z.object({ id: z.string().min(1), label: z.string() })).optional(),
});
```

`subOptions` aplica igual a `seleccion_unica` y `seleccion_multiple`: una opción con `subOptions` no cambiada su semántica de selección (sigue siendo una opción radio/checkbox normal); solo que, mientras esté seleccionada, el Runtime revela sus sub-opciones como checkboxes independientes (selección múltiple siempre, sea cual sea el tipo del padre — mismo patrón que S&P).

### Respuesta de las sub-opciones: clave sintética, sin cambios en `response.ts`

La respuesta del elemento padre **no cambia de forma** (`seleccion_unica` sigue guardando `string` = id de la opción elegida; `seleccion_multiple` sigue guardando `string[]`). Las sub-opciones marcadas se guardan en el mismo mapa `answers` bajo una **clave sintética** `` `${elementId}::${optionId}` `` → `string[]` (ids de sub-opciones marcadas):

```ts
// answers de un Subindicador con un elemento seleccion_unica (id "el-1")
// cuya opción "opt-si" (id) tiene subOptions y el evaluado marcó 2:
{
  "el-1": "opt-si",              // respuesta del elemento, forma sin cambios
  "el-1::opt-si": ["sub-a", "sub-c"], // clave sintética, valor string[] (ya soportado por answerValue)
}
```

Esto es deliberado: `responseAnswers = z.record(string, answerValue)` ya acepta cualquier clave string y `answerValue` ya incluye `string[]` — **cero cambios en `packages/sdk-core/src/response.ts`, `rule.ts` (evaluación de `visibleIf`), ni en el schema de `packages/db`**. El progreso (`hasAnswer`) y `visibleIf` siguen mirando únicamente `answers[elementId]` (la respuesta del padre); las claves sintéticas no cuentan para progreso ni se usan en condiciones — son un detalle de renderizado/registro, no una unidad de "pregunta respondida" nueva. `"::"` no puede colisionar con un `id` real de elemento (siempre `crypto.randomUUID()`).

### Builder

`SubindicatorFormEditorPage` (`form.md` → UI Builder): cada fila de opción de `seleccion_unica`/`seleccion_multiple` gana una lista anidada de sub-opciones editable con el mismo patrón CRUD que las opciones (`addSubOption`/`updateSubOption`/`removeSubOption`, mismos botones "Agregar"/"Quitar"), colapsada por defecto si la opción no tiene ninguna todavía.

### Runtime

`ElementView` (`persistence.md` → UI Runtime): al renderizar `seleccion_unica`/`seleccion_multiple`, si la opción actualmente seleccionada/marcada tiene `subOptions`, se renderiza debajo un grupo de checkboxes adicional (mismo componente visual que `seleccion_multiple`, `<fieldset>` anidado) que lee/escribe `answers[`${element.id}::${opt.id}`]`. Si la opción se deselecciona, las sub-respuestas quedan en el mapa (no se borran) por si el evaluado vuelve a seleccionarla — mismo criterio que el resto del motor (autosave guarda estado intermedio, no valida completitud).

### Fuera de alcance (explícito)

- **Exportación CSV de sub-opciones** (`export.md`): v1 de este gap no agrega columnas nuevas al CSV — sigue resolviendo solo la opción del padre. Aditivo para un slice futuro si se pide.
- **Sub-opciones recursivas (2+ niveles)** — ver arriba.
- **`visibleIf` sobre una sub-opción específica** — las condiciones siguen operando solo sobre elementos (`elementId`), no sobre sub-opciones dentro de un elemento.

## Campo URL pública (VS-017)

Gap 2 de `../analysis/csa-sp-global-comparison.md`: en S&P, una pregunta puede pedir hasta 3 referencias de URL pública (evidencia por enlace, complementaria a `evidencia` que son archivos). Se implementa como un tipo de Elemento nuevo, `url_publica` — no una config de `evidencia`, porque conceptualmente son dos formas de evidencia distintas (archivo subido a R2 vs. referencia externa) que ya tienen tratamientos separados en S&P.

```ts
z.object({
  ...questionBase,
  type: z.literal("url_publica"),
  maxUrls: z.number().int().positive().optional(), // default en Runtime/Builder: 3 (mismo límite observado en S&P)
});
```

**Respuesta**: `string[]` — reutiliza la variante ya existente de `answerValue` (la misma que usa `seleccion_multiple`), **cero cambios en `response.ts`**. A diferencia de un campo de texto libre, una entrada vacía a medio escribir NO se guarda en el array — el Runtime filtra strings vacíos/solo-espacios antes de escribir en `answers` (`.filter(Boolean)` sobre el valor recortado). Esto es deliberado: `hasAnswer` (`response.ts`) trata cualquier array no vacío como "respondido", así que un array con un slot en blanco (`[""]`) contaría erróneamente como respuesta — al no persistir slots vacíos, el criterio de progreso/exportación sigue siendo correcto sin tocar `hasAnswer`, que es compartido por todos los tipos de elemento.

No hay validación de formato de URL en el servidor — mismo criterio ya documentado en `persistence.md` ("Validación de reglas de contenido al guardar" fuera de alcance): el motor guarda lo que el evaluado escribe. El Runtime usa `<input type="url">` por slot (hint nativo del navegador, no bloqueante).

### `packages/sdk-core/src/component-registry.ts`

Nueva entrada `{ type: "url_publica", label: "URL pública", isQuestion: true, version: 1 }` — el chequeo de exhaustividad existente (`AssertSameSet`) obliga a agregarla en el mismo cambio que el tipo en `form-schema.ts`.

### Builder

Config del elemento: campo numérico `Máximo de URLs` (`maxUrls`, igual patrón que `maxFiles` de `evidencia`).

### Runtime

Hasta `maxUrls` (default 3) inputs de tipo `url`, con botón "Agregar URL" (deshabilitado al llegar al máximo) y "Quitar" por slot — mismo patrón visual que la lista de Opciones del Builder, no una lista de archivos (no hay subida, es texto).

### Exportación (`export.md`)

`formatAnswer` gana una rama para `url_publica`: igual que `seleccion_multiple`, une el array con `"; "` (sin resolver labels, son URLs literales).

## Numeración automática de preguntas (VS-021)

Gap 6 de `../analysis/csa-sp-global-comparison.md` — ver `../domain/evaluation-hierarchy.md` ("Numeración automática VS-021") para la numeración del árbol Dimensión→Indicador→Subindicador; esta sección cubre solo las preguntas dentro de un Subindicador, que en S&P se numeran `0.1`, `0.2`... siempre reiniciando en cada Subindicador (no es un contador global del Framework).

```ts
// packages/sdk-core/src/component-registry.ts (o form-schema.ts)
export function questionNumber(questionIndex: number): string {
  return `0.${questionIndex + 1}`;
}
```

`questionIndex` es la posición (0-based) del Elemento dentro de la lista **ya filtrada a solo preguntas** (`isQuestion: true` vía `component-registry.ts` — el mismo filtro que ya usan `progressOf`, `export.md` y la página de Revisión) y **ya filtrada por `visibleIf`** (`../engines/rule.md`) cuando corresponde al Runtime — un elemento oculto condicionalmente no ocupa número, mismo criterio que "no cuenta para el progreso". `instruccion`/`banner` no son preguntas (`isQuestion: false`) y no reciben número.

## Select dropdown (VS-022)

Gap 7 de `../analysis/csa-sp-global-comparison.md` (sección "Segunda inspección"): el portal S&P usa `div.sims-select` (`data-dpd-type="List"`) para listas cerradas (moneda, unidad, porcentaje) dentro y fuera de tablas. La plataforma hoy solo tiene `seleccion_unica` (radio). Se implementa como un tipo de Elemento nuevo, `seleccion_desplegable` — no una variante visual de `seleccion_unica` — porque el registry/exhaustividad y el Builder ya tratan cada `type` como una entrada independiente, y un dropdown con muchas opciones (ej. lista de monedas) es un caso de uso claramente distinto al radio (pocas opciones, todas visibles).

```ts
z.object({
  ...questionBase,
  type: z.literal("seleccion_desplegable"),
  options: z.array(formOption).min(1),
});
```

Reusa `formOption` sin cambios (mismo `{id, label, subOptions?}` que `seleccion_unica`/`seleccion_multiple`) — **`subOptions` no aplica en la práctica a un dropdown** (el portal S&P no lo usa así) pero no se excluye del tipo por simplicidad de reutilización; el Runtime de `seleccion_desplegable` simplemente no renderiza sub-opciones aunque estén presentes (fuera de alcance, ver abajo).

**Respuesta**: `string` (id de la opción elegida) — forma idéntica a `seleccion_unica`, **cero cambios en `response.ts`**.

### `packages/sdk-core/src/component-registry.ts`

Nueva entrada `{ type: "seleccion_desplegable", label: "Selección desplegable", isQuestion: true, version: 1 }` — el chequeo de exhaustividad (`AssertSameSet`) obliga a agregarla en el mismo cambio que el tipo en `form-schema.ts`.

### Builder

Mismo bloque de config y mismo CRUD de opciones que `seleccion_unica` (`addOption`/`updateOption`/`removeOption`), sin el CRUD de `subOptions` (no aplica, ver arriba) — el guard de type-narrowing existente (`el.type !== "seleccion_unica" && el.type !== "seleccion_multiple"`) gana una tercera rama `el.type !== "seleccion_desplegable"` allí donde el dropdown comparte handler con los otros dos tipos de opciones.

### Runtime

`<select>` nativo con una `<option>` por `element.options[]` (label = texto visible, value = id) más una opción vacía inicial ("Seleccionar…") cuando no hay valor — mismo patrón de lectura/escritura que `seleccion_unica` (`onChange` con el id elegido), sin fieldset de radios.

### Exportación (`export.md`)

`formatAnswer` gana una rama idéntica a la de `seleccion_unica`: resuelve `value` contra `element.options` y exporta el `label`, no el id.

### Fuera de alcance (explícito)

- **`subOptions` en `seleccion_desplegable`** — el tipo lo permite (reuso de `formOption`) pero el Runtime no lo renderiza; si aparece un caso real, es aditivo.
- **Búsqueda/autocomplete en el dropdown** — el portal S&P usa un `<select>` simple para las listas observadas (moneda, unidad, %); no se documentó un combobox con búsqueda. Si una lista muy larga (+50 opciones) lo requiere, es un cambio de UI, no de contrato.

## Unidad por campo numérico (VS-023)

Gap 8 de `../analysis/csa-sp-global-comparison.md`: en el portal S&P, un campo numérico dentro de un sub-cuestionario cuantitativo (ej. 2.6.1) lleva `data-dpd-unit` (unidad fija mostrada, ej. "met. ton. CO2e") y opcionalmente `data-dpd-available-units` (lista de unidades entre las que el evaluado puede elegir, ej. "MWh, GJ, kWh"). Se implementa como config aditiva de `numero`, no un tipo nuevo — el elemento sigue siendo una pregunta numérica, la unidad es metadata de presentación/config, igual que `min`/`max`.

```ts
z.object({
  ...questionBase,
  type: z.literal("numero"),
  min: z.number().optional(),
  max: z.number().optional(),
  unit: z.string().min(1).optional(),                       // unidad fija mostrada (ej. "met. ton. CO2e", "%", "S/")
  availableUnits: z.array(z.string().min(1)).min(1).optional(), // si está presente, el evaluado elige entre estas en vez de ver `unit` fija
});
```

`unit` y `availableUnits` son independientes en el tipo (ambos opcionales) pero mutuamente excluyentes en la UI por convención del Builder (no una regla `superRefine` — no vale la pena la complejidad de validación cruzada para una regla de presentación): si `availableUnits` está presente, el Runtime muestra un `<select>` de unidad y `unit` se ignora como default visual (opcionalmente como valor preseleccionado si `availableUnits.includes(unit)`); si solo `unit` está presente, se muestra como texto fijo al lado del input (no editable).

### Respuesta de la unidad elegida: clave sintética, sin cambios en `response.ts`

El valor de `numero` no cambia de forma (`AnswerValue` sigue siendo `number` para este elemento). Cuando `availableUnits` está presente y el evaluado elige una unidad distinta a la default, se guarda bajo una **clave sintética** `` `${elementId}::unit` `` → `string` (una de `availableUnits`) en el mismo mapa `answers` — mismo patrón ya usado para `naKey`/`commentKey` (`persistence.md`) y para las sub-opciones anidadas (VS-016, `${elementId}::${optionId}`). **Cero cambios en `packages/sdk-core/src/response.ts`**: `responseAnswers` ya acepta cualquier clave string y `answerValue` ya incluye `string`.

```ts
// packages/sdk-core/src/response.ts — junto a naKey/commentKey existentes
export function unitKey(elementId: string): string {
  return `${elementId}::unit`;
}
```

Si no hay entrada `unitKey(el.id)` en `answers`, el Runtime asume `availableUnits[0]` (o `unit`, si no hay `availableUnits`) como unidad implícita — no se persiste una unidad "por defecto no elegida", mismo criterio que el resto del motor (autosave guarda solo lo que el evaluado tocó).

### `packages/sdk-core/src/component-registry.ts`

Sin cambios — `numero` ya es una entrada existente, esta es una extensión de config, no un tipo nuevo (no dispara el chequeo de exhaustividad).

### Builder

Bloque de config de `numero` (junto a `min`/`max`) gana: campo de texto `Unidad` (`unit`) y campo de texto `Unidades disponibles (separadas por coma)` (`availableUnits`) — mismo patrón ya usado en este archivo para `acceptedTypes` de `evidencia` (input de texto libre, split por coma, filtrado de vacíos), no un CRUD de filas: no reusa `formOption` (`{id, label}`, pensado para opciones con identidad estable) porque aquí el string *es* el valor, no hay id que mapear.

### Runtime

El bloque agrupado `texto_corto|texto_largo|numero` (`ElementView`) gana, solo para `numero` con `unit` o `availableUnits` presentes, un elemento adicional junto al `<input type="number">`:
- Si `availableUnits`: `<select>` que lee/escribe `answers[unitKey(element.id)]` vía `onAnswerChange` (no `onChange`, que es solo para el valor numérico del elemento).
- Si solo `unit` (sin `availableUnits`): `<span>` de texto fijo, no interactivo.

### Exportación (`export.md`)

`formatAnswer` cambia de firma: hoy recibe `(element, value, markedNA)`; para resolver la unidad necesita también `answers` completo (para leer `answers[unitKey(element.id)]`) — se cambia a `(element, value, markedNA, answers)` en el mismo cambio, todos los call-sites se actualizan. Para `numero` con unidad configurada, el CSV exporta `"${value} ${unidad resuelta}"` (unidad elegida si hay `availableUnits` + respuesta, si no la `unit` fija, si no ninguna unidad y el formato queda igual que hoy). Para `numero` sin `unit`/`availableUnits`, comportamiento sin cambios (fallback `String(value)`).

### Fuera de alcance (explícito)

- **Conversión entre unidades** (ej. mostrar el mismo valor en MWh y GJ simultáneamente, o convertir automáticamente) — el motor solo persiste qué unidad eligió el evaluado, no hace matemática de conversión. Si se necesita, es `engine/formula` (M10), fuera de alcance de este slice.
- **Validación de que la unidad elegida esté en `availableUnits`** en el servidor — igual criterio que el resto de "Validación de reglas de contenido al guardar" (`persistence.md`): el motor guarda lo que llega, no valida contra la config al escribir.

## Contratos (`packages/sdk-core`)

Nuevo archivo `packages/sdk-core/src/form-schema.ts`, mismo patrón que `domain.ts` (zod + `z.infer`, exportado desde `index.ts`):

- `formElement` — `z.discriminatedUnion("type", [...])`, una rama zod por tipo de la tabla anterior.
- `formSchema` — `z.object({ schemaVersion: z.literal(1), elements: z.array(formElement) })`.
- Tipos derivados: `FormElement`, `FormSchema` (unión discriminada de TS, no una interfaz `formSchema: unknown` genérica).

`updateSubindicatorInput` (`packages/sdk-core/src/domain.ts`) gana el campo opcional que hoy está excluido a propósito (comentario "el motor de formularios es M4"):

```ts
export const updateSubindicatorInput = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  formSchema: formSchema.optional(),
});
```

## Persistencia (`packages/db`)

Ya implementada desde VS-004, sin cambios necesarios: `updateSubindicator` en `packages/db/src/domain/service.ts` acepta `formSchema?: unknown` y hace bump atómico de `revisionNumber` cuando la clave está presente en el input (`"formSchema" in input`). El motor v1 se apoya en esta capa tal cual — la validación de forma ocurre antes, en el límite de la API (zod), el servicio permanece agnóstico del contenido.

## API

`PATCH /api/subindicators/[id]` (`apps/web/app/api/subindicators/[id]/route.ts`) — se retira el comentario "formSchema no se acepta todavía" y el handler pasa a parsear el body completo con `updateSubindicatorInput` (ahora incluye `formSchema`). Mismo patrón de errores existente (`apps/web/lib/api-errors.ts`): `ZodError` → 400 con `details`.

No se agregan endpoints nuevos — el Form Editor reutiliza la ruta de update de Subindicador que ya existe.

## Autosave

- Debounce de 1500ms desde el último cambio local antes de disparar `PATCH` (evita un `revisionNumber` nuevo por cada tecla).
- Cada autosave exitoso muestra el `revisionNumber` devuelto por la API como confirmación visual ("Guardado — revisión N"), reusando la invariante de versionado ya documentada en `../domain/evaluation-hierarchy.md`.
- Sin colaboración concurrente (ver "Fuera de alcance") — no hay merge ni bloqueo optimista; el PATCH siempre sobrescribe con el estado local completo del array `elements`.
- Fallos de autosave (red, 401 por sesión expirada, etc.) se muestran inline sin perder el estado local en memoria — el usuario puede reintentar editando de nuevo (dispara otro debounce) sin recargar la página.

## UI (Builder)

Nueva ruta `apps/web/app/frameworks/[frameworkId]/dimensions/[dimensionId]/indicators/[indicatorId]/subindicators/[subindicatorId]/page.tsx` ("Form Editor"), mismo patrón que el resto del Builder (`"use client"`, `params` vía `use()`, `apps/web/lib/api-client.ts`). La página de Indicador (que hoy lista Subindicadores inline sin navegación a detalle) gana un enlace por Subindicador hacia esta ruta.

Editor v1: lista ordenada de Elementos, selector de tipo para agregar uno nuevo, formulario de config por elemento según su `type`, botones subir/bajar para reordenar (sin drag-and-drop — no se introduce una librería nueva solo para esto en v1), botón de borrar por elemento. Sin diseño visual elaborado, mismo criterio que VS-006.

## Testing

Mismo patrón que VS-004/VS-006:

- `packages/sdk-core`: tests de `formElement`/`formSchema` (zod) — casos válidos por tipo y casos inválidos (discriminante desconocido, campos requeridos faltantes).
- `packages/db`: test de integración contra Neon real que verifica que un `updateSubindicator` con `formSchema` incrementa `revisionNumber` exactamente en 1 (ya cubierto genéricamente por VS-004, se añade un caso con contenido `FormSchema`-shaped realista).
- `apps/web`: sin Playwright todavía (`../TECH_DEBT.md` TD-003) — verificación manual en navegador real (claude-in-chrome), mismo criterio que VS-006.
