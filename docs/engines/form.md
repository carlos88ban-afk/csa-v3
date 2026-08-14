# Motor: `engine/form` (v1 — M4/VS-007)

Orquestación de formularios por metadatos (`../architecture/overview.md`). Responsabilidad de este motor: definir la **forma** del `formSchema` (jsonb) que vive en cada Subindicador (`../domain/evaluation-hierarchy.md`) y las reglas para leerlo/escribirlo. No incluye render de Runtime para evaluados (M7), ni componentes pluggable/versionados (`engine/components`, M5), ni fórmulas/condicionales (`engine/formula`/`engine/rule`, M10).

## Alcance v1

- Editor (Builder) de la lista de Elementos de un Subindicador: crear, editar, reordenar, borrar.
- Autosave del `formSchema` mientras se edita.
- Validación **estructural** del `formSchema` (que el JSON tenga forma válida) vía zod en `sdk-core`, punto único de verdad para Builder y API (principio SDK-first).
- Cada Elemento puede declarar reglas de validación de **contenido** (`required`, `maxLength`, `min`/`max`, etc.) como metadatos — el motor v1 las *define y persiste*, no las *ejecuta* (no hay Runtime de respuesta todavía, eso es M7/`engine/persistence`).

## Fuera de alcance (explícito)

- Render del formulario para un evaluado respondiendo (Runtime) — M7 (VS-010).
- Tipos de elemento que dependen de otros motores todavía no construidos: `grid`, `upload` (necesitan R2 / `engine/components`, M5/M8), `condicional` (`engine/rule`, M10). (`tabla_datos`, `evidencia` y `calculado` ya implementados — VS-024/VS-008/VS-013.)
- Registry de componentes pluggable/versionado (`engine/components`) — v1 tiene un set fijo de tipos de elemento en código, no un registry externo.
- Ejecución de las reglas de validación de contenido sobre una respuesta real — solo se definen y se guardan.
- Colaboración en tiempo real (múltiples editores simultáneos sobre el mismo Subindicador) — fuera de alcance dado NFR-1 (~20 usuarios concurrentes, no necesariamente editando el mismo formulario a la vez). Sin lock ni resolución de conflictos; último autosave gana.

## Tipos de elemento v1

Subconjunto de `../domain/ubiquitous-language.md` (fila "Elemento") que no depende de motores futuros: **pregunta** (en sus variantes de texto/número/selección/tabla), **instrucción**, **banner**, **texto**. El resto (`grid`, `upload`, `repetible`, `condicional`) queda pendiente para M5/M8/M10.

| `type` | Uso | Config propia |
|---|---|---|
| `texto_corto` | Pregunta de respuesta corta (input de una línea) | `maxLength?: number` |
| `texto_largo` | Pregunta de respuesta larga (textarea) | `maxLength?: number` |
| `numero` | Pregunta numérica | `min?: number`, `max?: number`, `unit?: string`, `availableUnits?: string[]` — ver "Unidad por campo numérico" |
| `seleccion_unica` | Pregunta de opción única (radio) | `options: {id, label, subOptions?}[]` — ver "Opciones anidadas" |
| `seleccion_multiple` | Pregunta de opción múltiple (checkbox) | `options: {id, label, subOptions?}[]`, `minSelected?`, `maxSelected?` — ver "Opciones anidadas" |
| `seleccion_desplegable` | Pregunta de opción única (dropdown) | `options: {id, label, subOptions?}[]` — ver "Select dropdown" |
| `instruccion` | Texto informativo, no captura respuesta | — |
| `banner` | Aviso destacado, no captura respuesta | `variant: "info" \| "warning"`, `content: string`, `startCollapsed?: boolean` — ver "Banner: título/contenido y estado inicial" |
| `url_publica` | Pregunta de referencias URL públicas (máx. N) | `maxUrls?: number` — ver "Campo URL pública" |
| `tabla_datos` | Pregunta de tabla filas × columnas (tipo/unidad por fila) | `columns: {id, label}[]`, `rows: {id, label, cellType, unit?, availableUnits?, options?, maxLength?}[]` — ver "Tabla de datos" |

Campos base compartidos por todo elemento:

- `id: string` — UUID generado en cliente al crear el elemento. Estable entre ediciones; el Runtime futuro (M7) lo usará para mapear respuestas a elementos, por eso no se recicla ni se basa en el índice del array.
- `type: <tabla anterior>`
- `label: string` — texto de la pregunta/instrucción, **título** del banner (VS-037, ver "Banner: título/contenido y estado inicial" — es lo único visible cuando el banner está contraído). **Permite vacío a propósito**: el autosave guarda el formulario mientras se edita (un elemento recién agregado empieza con `label: ""`), no solo su estado terminado. Que todo elemento tenga label no-vacío es una validación de "¿está listo para publicarse?" que pertenece a `engine/publishing` (M6), no una condición para poder guardar un borrador.
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
- **Sub-opciones recursivas (2+ niveles)** — resuelto en VS-026, ver abajo.
- **`visibleIf` sobre una sub-opción específica** — las condiciones siguen operando solo sobre elementos (`elementId`), no sobre sub-opciones dentro de un elemento.

## Sub-opciones a 2 niveles (VS-026)

Ajuste menor de `../analysis/csa-sp-global-comparison.md` ("Segunda inspección"): el sub-cuestionario 2.6.1 del portal S&P usa sub-opciones anidadas a 2 niveles (ej. "Sí, la empresa mide sus emisiones" → tabla → checkboxes de declaración). VS-016 dejó `subOptions` explícitamente no-recursivo ("aditivo si aparece un caso real de 2 niveles, no un rediseño") — este slice agrega ese segundo nivel, **fijo en 2, no recursión genérica**: no hay caso observado de un 3er nivel, y el proyecto evita diseñar para hipotéticos (`CLAUDE.md`).

```ts
const subSubOption = z.object({ id: z.string().min(1), label: z.string() });
const subOption = z.object({
  id: z.string().min(1),
  label: z.string(),
  subOptions: z.array(subSubOption).optional(), // 2do nivel, sin su propio subOptions — tope explícito
});
const formOption = z.object({
  id: z.string().min(1),
  label: z.string(),
  subOptions: z.array(subOption).optional(), // 1er nivel, ahora tipado como subOption (antes era subSubOption)
});
```

Cambio de forma: antes `formOption.subOptions` era `{id,label}[]`, ahora es `{id,label,subOptions?}[]` — **compatible hacia atrás**: cualquier `formOption` existente sin 2do nivel (`subOptions` de sub-opciones ausente/vacío) sigue siendo válido tal cual, zod no exige el campo nuevo.

### Respuesta del 3er nivel: misma convención de clave sintética, un `::` más

Mismo patrón que VS-016 (`${elementId}::${optionId}` → `string[]`), extendido un nivel: `` `${elementId}::${optionId}::${subOptionId}` `` → `string[]` (ids de sub-sub-opciones marcadas). Sigue **sin cambios en `response.ts`** (ninguna clave sintética de este patrón tiene función dedicada — ni la de VS-016 la tiene, se construye inline en el Runtime — se mantiene la misma convención por consistencia, no se introduce una función nueva solo para este nivel).

### Builder

`addSubOption`/`updateSubOption`/`removeSubOption` (VS-016) ganan sus equivalentes de 2do nivel — `addSubSubOption`/`updateSubSubOption`/`removeSubSubOption` — mismo patrón CRUD exacto, un nivel más de indexación (`elementId, optionId, subOptionId` en vez de `elementId, optionId`). JSX: cada fila de sub-opción (`.option-row--sub`) gana su propia lista anidada de sub-sub-opciones con el mismo estilo visual sangrado un nivel más (`.option-row--subsub`).

### Runtime

`SubOptionsView` (componente ya existente, VS-016) se vuelve auto-referencial una vez: al marcar una sub-opción que tiene su propio `subOptions`, se renderiza otro `SubOptionsView` anidado debajo (mismo componente, no uno nuevo) leyendo/escribiendo la clave de 3er nivel. Esto exige que `SubOptionsView` reciba `answers`/`onAnswerChange` completos (hoy solo recibe `value`/`onChange` de su propio nivel) para poder resolver la clave del nivel hijo. El tope de 2 niveles lo impone el tipo de dato (`subSubOption` no tiene `subOptions`), no un límite artificial en el componente — la recursión simplemente no tiene dónde seguir.

### Fuera de alcance (explícito)

- **3er nivel de sub-opciones o recursión genérica** — sin caso observado, ver "Decisión de diseño" de VS-016. Si aparece, es aditivo (repetir el mismo patrón un nivel más), no un rediseño.
- **Exportación CSV del 2do nivel** — mismo alcance que VS-016, no se agrega.

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

## Tabla de datos (VS-024)

Gap 9 de `../analysis/csa-sp-global-comparison.md` (sección "Segunda inspección"), el más grande y complejo de los 9 gaps de AN-001: `table.form-table` del portal S&P — filas × columnas (ej. filas = métricas "Total Scope 1"/"Coverage %", columnas = años "FY2022"..."FY2025"+"Target"), cada celda con tipo de dato propio (`data-dpd-type`), unidad y unidades alternativas (`data-dpd-unit`/`data-dpd-available-units`), maxlength/hint. Requiere `seleccion_desplegable` (VS-022) y `unit`/`availableUnits` (VS-023), ya cerrados.

**Decisión de diseño — el tipo de celda se define por fila, no por celda individual.** El DOM del portal S&P expone `data-dpd-type` por `<td>`, pero en los dos sub-cuestionarios inspeccionados (2.6.1, 0.1) el tipo es *siempre uniforme dentro de una fila* (ej. la fila "Total Scope 1" es `Float` con la misma unidad en las 4 columnas de año; la fila "Coverage %" es `Percent` en todas). Modelar el tipo por fila en vez de por celda evita una config combinatoria (filas × columnas) sin caso de uso real observado, y es coherente con la semántica de negocio: una fila **es** una métrica con una unidad, columnas **son** períodos/dimensiones de esa métrica. Si en el futuro aparece un caso real con tipo mixto dentro de una fila, es un cambio aditivo (mover `cellType` de la fila a la celda), no un rediseño — mismo criterio que "un solo nivel de anidamiento" en VS-016.

```ts
const formTableCellType = z.enum(["texto", "numero", "seleccion_desplegable"]);

const formTableColumn = z.object({
  id: z.string().min(1),
  label: z.string(), // encabezado de columna, ej. "FY 2024"
});

const formTableRow = z.object({
  id: z.string().min(1),
  label: z.string(), // encabezado de fila, ej. "Total Scope 1"
  cellType: formTableCellType,
  // Config propia de numero (VS-023) y seleccion_desplegable (VS-022),
  // aplicada a TODAS las celdas de la fila (no reusa questionBase — una fila
  // no es un Elemento, es una sub-config dentro de uno):
  unit: z.string().min(1).optional(),               // solo si cellType === "numero"
  availableUnits: z.array(z.string().min(1)).min(1).optional(), // solo si cellType === "numero"
  options: z.array(formOption).min(1).optional(),   // solo si cellType === "seleccion_desplegable"
  maxLength: z.number().int().positive().optional(), // solo si cellType === "texto"
});

z.object({
  ...questionBase,
  type: z.literal("tabla_datos"),
  columns: z.array(formTableColumn).min(1),
  rows: z.array(formTableRow).min(1),
});
```

`options` en `formTableRow` es estructuralmente opcional en el tipo (zod no puede expresar "requerido solo si cellType === X" dentro de un objeto plano sin un discriminated union anidado, que aquí no vale la complejidad) — el Builder exige `options` no vacío antes de guardar una fila `seleccion_desplegable` como regla de UI, no de schema; **fuera de alcance** una validación cruzada en `formSchema.superRefine` para esto (mismo criterio de costo/beneficio que `unit`/`availableUnits` mutuamente excluyentes en VS-023).

### Respuesta: nueva variante de `AnswerValue` — única vez que se ensancha desde VS-007

Ninguna de las 4 variantes existentes de `answerValue` (`string`, `number`, `string[]`, `EvidenceRef[]`) representa una matriz filas×columnas. Se agrega una quinta: un mapa anidado `rowId → columnId → valor de celda`, **no un array de filas** — mismo criterio ya usado en todo el motor de preferir mapas keyed-por-id a arrays cuando el id ya existe y es estable (`answers` en sí, las claves sintéticas `::status`/`::na`/`::comment`/`::unit`), evita ambigüedad de orden y permite escribir/leer una celda sin reconstruir el array completo.

```ts
// packages/sdk-core/src/response.ts
export const tableCellValue = z.union([z.string(), z.number()]);
export const tableValue = z.record(z.string(), z.record(z.string(), tableCellValue));
export type TableValue = z.infer<typeof tableValue>;

export const answerValue = z.union([
  z.string(),
  z.number(),
  z.array(z.string()),
  z.array(evidenceRef),
  tableValue,
]);
```

`hasAnswer` gana una rama: un objeto (no array) cuenta como respondido si **alguna** celda de **alguna** fila tiene un valor no vacío — no exige que la tabla esté completa (mismo criterio "guarda estado intermedio" que el resto del motor).

```ts
export function hasAnswer(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    return Object.values(value).some((row) => Object.values(row).some((cell) => cell !== undefined && cell !== ""));
  }
  return true;
}
```

Ningún otro sitio que consume `AnswerValue` genéricamente (`isAnswered`, `assertPublicResponseUpdateAllowed`, claves sintéticas `::status`/`::na`/`::comment`) necesita cambios — todos operan sobre el mapa `answers` completo o delegan en `hasAnswer`, no inspeccionan la forma interna del valor.

**Sin unidad por celda elegible en runtime** (a diferencia de `numero` suelto en VS-023): si una fila tiene `availableUnits`, el Runtime muestra el `<select>` de unidad **una vez por fila** (no por celda) porque la unidad es propiedad de la métrica, no de la celda individual — la unidad elegida se guarda con la misma clave sintética `unitKey` ya definida en VS-023, aplicada al **id compuesto** `` `${element.id}::${row.id}` `` en vez de `element.id` solo (sigue sin ensanchar `answerValue`, es otra clave sintética más en `answers`).

### `packages/sdk-core/src/component-registry.ts`

Nueva entrada `{ type: "tabla_datos", label: "Tabla de datos", isQuestion: true, version: 1 }`.

### Builder

Dos listas CRUD independientes, mismo patrón ya establecido (`addOption`/`updateOption`/`removeOption` de VS-016/022, `acceptedTypes` de `evidencia`):

- **Columnas**: lista simple de `{id, label}` — igual patrón que `options` de `seleccion_unica` pero sin sub-opciones (solo texto de encabezado).
- **Filas**: por cada fila, `label` + selector `cellType` (Texto/Número/Selección desplegable) + config condicional según `cellType` (idéntica a la ya construida para el tipo `numero` suelto en VS-023 y `seleccion_desplegable` en VS-022, reutilizada aquí a nivel de fila en vez de a nivel de Elemento) — mismo fix de `onBlur` para el campo `availableUnits` de cada fila (bug encontrado y corregido en VS-023).

No hay editor de celdas en el Builder — las celdas no tienen config propia (el tipo/unidad se hereda de la fila), el Builder solo define la grilla (filas × columnas), el contenido lo llena el evaluado en Runtime.

### Runtime

`<table>` real (accesibilidad: `<caption>` = label del elemento, `<th scope="col">` por columna, `<th scope="row">` por fila) — primera vez que el motor usa una tabla HTML nativa en vez de `<fieldset>`/`<label>`. Cada celda `<td>` renderiza el control según `row.cellType` (mismo control que el tipo suelto equivalente: `<input>` para `texto`/`numero`, `<select>` para `seleccion_desplegable`), leyendo/escribiendo `value[row.id]?.[column.id]` dentro del objeto `TableValue` completo del elemento (`onChange` reconstruye el objeto con la celda actualizada, mismo patrón inmutable que el resto del Runtime). Si `row.availableUnits` está presente, una columna extra al final de la fila (o un `<select>` compartido antes de la fila) para la unidad de esa fila vía `onAnswerChange(unitKey(`${element.id}::${row.id}`), ...)`.

### Exportación (`export.md`)

Una tabla no cabe en una sola celda CSV como texto plano legible sin estructura — `formatAnswer` gana una rama que serializa como `"fila1: col1=v1, col2=v2; fila2: col1=v3, ..."` (mismo separador `"; "` que ya usan `seleccion_multiple`/`url_publica` entre ítems, `", "` dentro de cada fila entre celdas), resolviendo labels de fila/columna (no ids) y agregando la unidad resuelta por fila igual que VS-023 cuando corresponda.

### Fuera de alcance (explícito)

- **Tipo de celda mixto dentro de una fila** — ver "Decisión de diseño" arriba.
- **Fórmulas/celdas calculadas dentro de la tabla** (ej. un total automático de fila o columna) — `engine/formula` (M10) opera sobre Elementos completos vía `{elementId}`, no sobre celdas individuales de una tabla; fuera de alcance de este slice.
- **Agregar/quitar filas o columnas desde el Runtime** — la grilla la define el Builder (admin), el evaluado solo llena celdas, igual criterio que el resto de `engine/form` (la estructura del formulario es responsabilidad del admin, no del evaluado).
- **`visibleIf` a nivel de fila o columna** — las condiciones siguen operando solo sobre Elementos completos, no sobre partes internas de una tabla (mismo alcance ya excluido para sub-opciones en VS-016).
- **maxlength/hint por celda individual** (mencionado en la inspección DOM del portal) — `maxLength` se modela por fila (aplica a `texto`), igual criterio de "por fila no por celda" que el resto de este gap; un hint de ayuda por fila puede reusar `helpText` del Elemento completo si se necesita, no se agrega un campo nuevo.

## Banner: título/contenido y estado inicial (VS-037, supersede VS-025)

> **Actualizado en VS-037 (2026-08-14):** VS-025 asumía que el gap de S&P no distinguía un resumen colapsado de un detalle expandido ("se colapsa/expande el mismo `label`") y lo dejó fuera de alcance explícitamente. El usuario pidió exactamente ese caso: el banner necesita un **título** (visible siempre, incluso contraído) y un **contenido** separado (visible solo expandido) — no el mismo texto recortado por CSS. Esta sección reemplaza la spec de VS-025; el registro de esa decisión queda como historial más abajo, no se borra.

```ts
z.object({
  ...formElementBase,
  type: z.literal("banner"),
  label: z.string(),   // Título — visible siempre, incluso contraído.
  content: z.string(), // Contenido — visible solo si el banner está expandido.
  variant: z.enum(["info", "warning"]),
  // Reemplaza expandable (VS-025): TODO banner ahora es contraíble/expandible
  // por el evaluado (ver Runtime) — esto solo define el estado en el que
  // arranca al cargar la página, no si puede o no expandirse.
  startCollapsed: z.boolean().optional(), // default false (arranca expandido)
});
```

### Builder

Sección "Textos" de `banner` gana un segundo campo `Contenido` (textarea, junto al campo `Título` que ya existía como `label`). Sección "Avanzado" (junto al selector `Tipo de aviso`) cambia el checkbox `Expandible/colapsable` por un select `Estado inicial: Contraído | Expandido` (`startCollapsed`).

### Runtime

`BannerView`: siempre renderiza un botón con caret (▸/▾) — ya no hay una rama "no expandible" sin toggle, porque el evaluado siempre puede contraer/expandir por su cuenta (esa es la parte central del pedido: la elección de lectura es del evaluado, el admin solo define con qué estado arranca). Contraído muestra solo el título (`label`); expandido muestra título + `content`. El estado inicial (`expanded` en `useState`) se siembra desde `!startCollapsed`; a partir de ahí es 100% interacción del evaluado, igual que antes — no persiste entre cargas de página (ver "Fuera de alcance").

### Migración de datos (VS-037)

Había 10 banners reales en la réplica de prueba de producción (`CSA 2026 — Réplica QA`) con el `label` viejo (texto completo) y sin `content`. Migrados con un script puntual (mismo patrón dry-run/`--write` que `csa-2026-replica.mts`): `content = label` viejo (preserva el texto completo como el nuevo contenido expandido — el admin puede acortar el título después a mano), `startCollapsed = (expandable === true)` (mapeo 1:1 del estado inicial: antes "expandable: true" arrancaba colapsado, ahora es explícito). Campo `expandable` eliminado de esas filas.

### Fuera de alcance (explícito)

- **Persistir el estado expandido/colapsado que elige el evaluado** — sigue siendo preferencia de lectura efímera, no una respuesta; se resetea al estado inicial configurado por el admin en cada carga de página, igual criterio que `collapsed` del árbol de navegación (VS-010, tampoco persiste).
- **Un banner que NO se pueda expandir/contraer en absoluto** — el pedido explícito del usuario es que el evaluado siempre retenga esa decisión; si se necesita un aviso verdaderamente estático en el futuro, es un tipo de elemento distinto (`instruccion` ya cubre "texto informativo sin ningún control"), no una config nueva sobre `banner`.

## Banner: contenido con formato (VS-038)

Pedido explícito del usuario: `content` (VS-037) era texto plano — un `<textarea>` en el Builder. El contenido real que se pega en un banner (ej. secciones de "Justificación de la pregunta"/"Definiciones clave" copiadas de un portal externo) viene con formato (negrita, párrafos, listas); pegarlo en un `<textarea>` lo aplanaba a texto corrido, perdiendo esa estructura. `content` pasa a ser HTML con la misma allowlist mínima que el comentario confidencial (VS-030) — **no un tipo nuevo de dato**, sigue siendo `z.string()` en el schema (sin cambio de zod), solo cambia qué significa esa cadena.

- **Motor reusado**: `packages/sdk-core/src/rich-text.ts` (`sanitizeCommentHtml`/`stripCommentHtml`, allowlist `strong`/`em`/`p`/`br`/`ul`/`li`) — el mismo que ya sanitizaba el comentario confidencial. No se crea un motor nuevo ni se extiende la allowlist; el título (`label`) sigue siendo texto plano, sin cambios.
- **Componente nuevo**: `apps/web/components/rich-text-editor.tsx` (`RichTextEditor`) — extrae la config de TipTap (StarterKit reducido a negrita/itálica/lista/párrafo) + toolbar de `NaCommentRow` (`apps/web/app/evaluations/[token]/page.tsx`) a un componente compartido, para no triplicar esa configuración al agregarla también al campo `Contenido` del banner en **dos** builders (`subindicator-editor.tsx` y el editor legado de subindicadores directos bajo Dimensión). `NaCommentRow` no se tocó — sigue con su propia variante (límite de caracteres vía `CharacterCount`, que `RichTextEditor` no impone por defecto).
- **Paste de texto con formato**: TipTap/ProseMirror parsea el HTML del portapapeles al pegar y mapea las etiquetas semánticas reconocidas (`<b>`/`<strong>`, `<i>`/`<em>`, listas, párrafos) a las marcas/nodos habilitados del editor — comportamiento nativo, no requiere configuración adicional más allá de tener el editor real (en vez de un `<textarea>` que solo acepta texto plano).
- **Runtime/Preview**: `BannerView`/`PreviewBanner` renderizan `content` con `dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(element.content) }}` — se re-sanitiza en el borde de lectura (defensa en profundidad, mismo criterio que la página de Revisión con el comentario confidencial) aunque el HTML ya se sanitizó al guardar en el Builder.
- **Sin migración de datos**: los 10 banners migrados en VS-037 tienen `content` en texto plano sin tags — HTML válido igualmente (sin nada que interpretar como markup), se siguen viendo idénticos.

### Historial: spec original (VS-025, superada)

Ajuste menor de `../analysis/csa-sp-global-comparison.md` ("Segunda inspección"): el portal S&P usa `banner-expandable` con un triángulo — el banner arrancaba colapsado (una línea) y se expandía al click para mostrar el texto completo, colapsando/expandiendo el mismo `label` (sin campo de contenido separado). Config original: `expandable?: boolean` (default `false`, sin caret ni toggle si estaba ausente).

## Comentario confidencial con formato (VS-028, actualizado en VS-030)

> **Actualizado en VS-030 (2026-08-06, `docs/adr/0006-editor-wysiwyg-comentario-confidencial.md`):** la decisión "markdown-lite sin dependencia nueva" de VS-028 fue revertida a pedido del usuario — el campo ahora usa un editor WYSIWYG real (TipTap). El resto de esta sección se conserva como registro histórico de la decisión original; ver la ADR 0006 para el razonamiento del cambio y `### VS-030` más abajo para el estado actual.

Ajuste menor de `../analysis/csa-sp-global-comparison.md`: el portal S&P usa un editor rich text (Jodit) para el comentario confidencial (VS-019, `commentKey`, antes `<textarea>` plano). El proyecto no tenía ninguna dependencia de UI de edición de texto instalada y tenía precedente explícito de evitar dependencias nuevas sin justificar (`../engines/export.md`, CSV manual sin librería). Un editor WYSIWYG real (Jodit/TipTap/Slate) es una dependencia no trivial (bundle, accesibilidad de un `contentEditable`, mantenimiento) para un campo que **no es visible para el evaluado que lo escribe en ningún renderizado especial** — solo se lee de vuelta en la página de Revisión y en el CSV, ambos de solo-lectura administrativa.

**Decisión original (VS-028, superada): markdown-lite hecho a mano, sin dependencia nueva.** `commentKey` seguía guardando `string` y ese string podía contener una sintaxis mínima (`**negrita**`, `*itálica*`, líneas que empiezan con `- ` como lista) escrita vía 3 botones que envolvían/prefijaban la selección del `<textarea>`.

### VS-030 — Editor WYSIWYG real (TipTap)

`commentKey` **sigue guardando `string`** — cero cambio de forma en `response.ts`/`AnswerValue`, tal como VS-028 ya anticipaba en su sección "Fuera de alcance" — pero ese string ahora es **HTML sanitizado** en vez de markdown-lite. Ver ADR 0006 para el razonamiento completo (por qué TipTap y no Jodit literal, alternativas descartadas, riesgos).

- **Sanitización** (`packages/sdk-core/src/rich-text.ts`, nuevo): `sanitizeCommentHtml`/`stripCommentHtml`, allowlist mínima (`strong`/`em`/`p`/`br`/`ul`/`li`, sin atributos) vía `sanitize-html` — mismo alcance mínimo que el markdown-lite anterior, ahora con cobertura de tests unitarios (`packages/sdk-core/src/rich-text.test.ts`, incluyendo intentos de XSS).
- **Runtime** (`apps/web/app/evaluations/[token]/page.tsx`, `NaCommentRow`): editor TipTap (`@tiptap/react`, `StarterKit` reducido a párrafo/negrita/itálica/lista + `CharacterCount` para el límite de 5000 chars) reemplaza al `<textarea>`. Toolbar de 3 botones (`B`/`I`/`•`) ejecuta comandos TipTap en vez de manipular `selectionStart`/`selectionEnd`; refleja estado activo vía `aria-pressed`. Sincroniza contenido externo (Cancel/Reset, VS-020) comparando `comment` contra `editor.getHTML()` para no interrumpir al evaluado mientras escribe.
- **Página de Revisión**: `dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(comment) }}` (antes `renderLiteMarkdown`) — sanitiza de nuevo en el borde de lectura (defensa en profundidad) aunque el HTML ya se sanitizó al guardar.
- **Exportación** (`export.md`): `stripCommentHtml` (antes `stripLiteMarkdown`) despoja todo tag HTML a texto plano para la celda CSV, preservando saltos de línea entre bloques/items de lista.
- **Sin migración de datos**: corte limpio, no había comentarios reales en producción con la sintaxis markdown-lite vieja al momento del cambio (confirmado con el usuario antes de implementar).

### Fuera de alcance (explícito)

- **Paridad literal con Jodit** — se adoptó TipTap en su lugar (ver ADR 0006, "Alternativas descartadas").
- **Migración/compatibilidad con el formato markdown-lite anterior** — no aplicaba, sin datos reales que migrar.
- **Sintaxis markdown completa** (links, headings, tablas, código) — alcance mínimo deliberado (negrita/itálica/lista), aditivo si se pide más.
- **Renderizado con formato en el propio Runtime mientras se escribe (preview en vivo)** — el evaluado escribe en el `<textarea>` plano con los 3 botones de ayuda; el renderizado formateado solo aplica en Revisión (lectura administrativa), no hay preview WYSIWYG en tiempo real — evita la complejidad de un split-view sin aportar al caso de uso (el evaluado no necesita ver el resultado formateado, solo el administrador que revisa).

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

## Referencias de URL por opción (VS-039, implementado — 2026-08-14)

Hallazgo de la 4.ª inspección (2026-08-14, validación en producción contra el HTML real de la pregunta 0.1 "Sustainability Reporting Boundaries" del portal S&P enviado por el usuario). El mapeo de AN-001 daba por resuelto el gap de URLs públicas con VS-017 (`url_publica` como Elemento independiente), pero el HTML real muestra un matiz distinto: **las referencias viven DENTRO de cada opción de un radio, no como elemento de la pregunta**.

En el DOM real de S&P, la misma pregunta tiene 2 bloques de referencias separados, cada uno adjunto a una opción distinta:

- Opción "Sí, la empresa informa sobre el alcance o los límites de su divulgación de sostenibilidad" → fila de referencias propias (`div.sims-input.reference`, `data-ref-type="public"`, `data-maxrefs="3"`) + sub-pregunta anidada (OverallSustainabilityDisclosure) con 4 sub-opciones, una de ellas con select de porcentaje dentro de la sub-opción (`data-dpd-type="List"`).
- Opción "No, la empresa no informa, pero sí ha divulgado ciertos indicadores" → fila de referencias propias (máx. 3) + checkboxes de indicadores ambientales/sociales.
- Opciones "No" y "N/A" → sin referencias.

Esto es **estructuralmente distinto** de `url_publica` (VS-017): no es un elemento numerado más (`0.x`), es un campo adjunto a la opción que aparece al seleccionarla. El usuario fue explícito: *"No es que sean preguntas separadas sino que es una sola pregunta"* — la plataforma actual no puede replicarlo sin este slice.

### Decisión de diseño

Nuevo campo opcional `references` en `formOption` (opciones de `seleccion_unica` y `seleccion_multiple`):

```ts
const formOptionReference = z.object({
  id: z.string().min(1),
  maxUrls: z.number().int().positive().optional(), // default 3 (límite observado en S&P)
});
const formOption = z.object({
  id: z.string().min(1),
  label: z.string(),
  subOptions: z.array(subOption).optional(),
  references: z.object({
    maxUrls: z.number().int().positive().optional(),
  }).optional(), // VS-039: campo de URL pública adjunto a esta opción
});
```

- **Compatible hacia atrás**: campo opcional, ningún `formSchema` existente cambia de forma; zod no exige el campo nuevo.
- **Respuesta**: misma convención de clave sintética que VS-016, un segmento más: `` `${elementId}::${optionId}::refs` `` → `string[]` (URLs literales, mismo filtrado `.filter(Boolean)` de VS-017 para no contar slots vacíos como respuesta). Sin cambios en `response.ts` — misma convención que el 3er nivel de sub-opciones.
- **Runtime**: al seleccionar la opción con `references`, se renderiza debajo la lista de inputs URL (patrón visual de `url_publica`, reutilizando la misma UI de slots con "Agregar URL"/"Quitar").
- **Builder**: cada opción gana un botón "Agregar referencias (URL)" que despliega el campo `maxUrls` (default 3); el Runtime/export tratan las URLs como literales (`"; "` join, sin resolución de labels — misma rama de `url_publica` en `export.md`).

### Fuera de alcance (explícito)

- **Controles (select/dropdown) dentro de sub-opciones** — resuelto por VS-040 (ver sección siguiente), ya no está fuera de alcance.
- **Visibilidad condicional de referencias por sub-opción** — `references` se adjunta a la opción padre (nivel 1), no a sub-opciones. (VS-040 lo extiende a sub-opciones de nivel 1 también — ver abajo — pero sigue sin condicionarse por `visibleIf`.)
- **`visibleIf` sobre referencias** — misma limitación ya documentada en VS-016/VS-026: las condiciones operan sobre elementos, no sobre partes de una opción.

### Notas de implementación

- `formOption.references` es `{ maxUrls?: number }` (sin `id` propio — la clave sintética ya identifica opción + elemento, no hace falta un id adicional del bloque de referencias).
- **Export CSV** (`apps/web/app/api/evaluations/[id]/export/route.ts`): sigue siendo "una fila por Elemento" (ver `export.md`) — no se agrega fila/columna nueva. Las referencias de la opción elegida se anexan como sufijo de la celda `Respuesta` ya existente: `{label de la opción} (Referencias: url1; url2)`, mismo criterio `"; "` join sin resolución de labels que `url_publica`. Aplica tanto a `seleccion_unica` (la opción elegida) como a `seleccion_multiple` (cada opción elegida que tenga `references`, dentro del join `"; "` ya existente entre opciones).
- **Builder/Runtime/preview**: `apps/web/components/subindicator-editor.tsx` (botón + campo `maxUrls` por opción), `apps/web/app/evaluations/[token]/page.tsx` (`OptionReferencesView`, mismo patrón de slots que `UrlPublicaView`), `apps/web/components/form-preview.tsx` (slots de solo lectura en el preview en vivo del Builder, mismo criterio que el resto de `url_publica` ahí).
- Verificado manualmente en navegador real (Builder + preview en vivo + Runtime público + export CSV) con un framework temporal creado y borrado al terminar (`DELETE /api/frameworks/[id]`, mismo endpoint ya existente) — sin dejar datos de prueba en la base de producción.

## Campos embebidos en sub-opciones + exclusividad configurable (VS-040, implementado — 2026-08-14)

Segundo hallazgo sobre la misma pregunta 0.1 "Sustainability Reporting Boundaries" (HTML real de S&P enviado por el usuario, mismo día que VS-039). El usuario pidió analizar la estructura completa de la sub-pregunta anidada bajo la opción "Sí, la empresa informa...", explícitamente dejada fuera de alcance en VS-039.

### Hallazgo

La sub-pregunta anidada `OverallSustainabilityDisclosure` (revelada al marcar "Sí, la empresa informa...") tiene 4 sub-opciones:

1. "Todas las actividades totalmente consolidadas..." — texto plano.
2. "El siguiente porcentaje de los ingresos... está cubierto:" — trae un **`<select>` embebido** (`data-dpd-type="List"`, rangos de porcentaje) que solo tiene sentido si se marca esta sub-opción.
3. "Actividades bajo control operativo..." — texto plano.
4. "Nada de lo anterior, pero..." — texto plano.

Dos gaps, no uno:

- **Gap A (lo pedido explícitamente)**: una sub-opción puede traer su propio campo (el select de porcentaje). `subOption` hoy es solo `{ id, label, subOptions? }` — no puede cargar un campo propio.
- **Gap B (hallazgo adicional en el mismo HTML)**: el grupo `OverallSustainabilityDisclosure` es `type="radio"` — **mutuamente excluyente** (marcar una desmarca las demás). El Runtime actual (`SubOptionsView`) renderiza **todas** las sub-opciones como `checkbox` (selección múltiple) en cualquier nivel — decisión de VS-016 documentada como *"siempre selección múltiple, mismo patrón que S&P"*, que este HTML real contradice. Sin corregirlo, la plataforma permitiría marcar "Todas las actividades" y "% de ingresos" al mismo tiempo, algo que S&P no permite. Confirmado con el usuario (`AskUserQuestion`) que se corrige en el mismo slice.

### Decisión de diseño

`formOption` gana `subOptionsExclusive` (gobierna el grupo `subOptions` de nivel 1 únicamente); `subOption` gana `references` (mismo campo que VS-039, ahora también a nivel de sub-opción) y `field` (el campo embebido):

```ts
const subOptionFieldOption = z.object({ id: z.string().min(1), label: z.string() });
const subOptionField = z.discriminatedUnion("type", [
  z.object({ type: z.literal("seleccion_desplegable"), options: z.array(subOptionFieldOption).min(1) }),
  z.object({ type: z.literal("texto_corto"), maxLength: z.number().int().positive().optional() }),
  z.object({
    type: z.literal("numero"),
    min: z.number().optional(),
    max: z.number().optional(),
    unit: z.string().min(1).optional(),
  }),
]);

const subOption = z.object({
  id: z.string().min(1),
  label: z.string(),
  subOptions: z.array(subSubOption).optional(),
  references: z.object({ maxUrls: z.number().int().positive().optional() }).optional(), // VS-040: mismo campo que formOption.references, ahora en sub-opción
  field: subOptionField.optional(), // VS-040: campo embebido (select/texto/número)
});

const formOption = z.object({
  id: z.string().min(1),
  label: z.string(),
  subOptions: z.array(subOption).optional(),
  subOptionsExclusive: z.boolean().optional(), // VS-040: default false (checkbox/múltiple, comportamiento actual) — true = radio/excluyente
  references: z.object({ maxUrls: z.number().int().positive().optional() }).optional(),
});
```

- **Compatible hacia atrás**: los 3 campos son opcionales; `subOptionsExclusive` por defecto (`undefined`/`false`) preserva el comportamiento actual (checkbox/múltiple) para todo `formSchema` existente — sin migración.
- **Respuesta**: mismo patrón de clave sintética que VS-039, un segmento más allá de la propia clave de la sub-opción: `` `${elementId}::${optionId}::${subOptionId}::field` `` → `string | number` (según el tipo del field) y `` `${elementId}::${optionId}::${subOptionId}::refs` `` → `string[]`. No colisiona con la clave de sub-sub-opciones (`${elementId}::${optionId}::${subOptionId}`, sin sufijo) que ya existe desde VS-026. Sin cambios en `response.ts`.
- **Exclusividad**: cuando `subOptionsExclusive` es `true`, el grupo de `subOptions` de esa opción se renderiza como radios (un solo `value: string` en la clave `${elementId}::${optionId}`, no un array) — igual que el nivel raíz de `seleccion_unica`. Cuando es `false`/ausente, sigue como hasta ahora (checkboxes, `string[]`). **Solo afecta el nivel 1** (`formOption.subOptions`); el nivel 2 (`subOption.subOptions`, sub-sub-opciones) sigue siendo siempre checkbox/múltiple — sin evidencia de necesitar excluyencia ahí, aditivo si aparece.
- **Runtime**: al marcar una sub-opción con `field`, se renderiza debajo el control correspondiente (`<select>`, `<input type="text">` o `<input type="number">`, mismo patrón visual que los tipos de Elemento equivalentes). Al marcar una con `references`, se renderiza debajo la lista de slots de URL (mismo `OptionReferencesView` de VS-039, reutilizado tal cual con la clave un nivel más adentro).
- **Builder**: cada opción con sub-opciones gana un checkbox "Sub-opciones excluyentes (solo una a la vez)"; cada sub-opción gana los mismos botones que una opción de nivel 1 ("Agregar referencias (URL)") más un selector "Agregar campo" (Selección desplegable / Texto corto / Número) con su configuración correspondiente y botón "Quitar campo".

### Corrección de una inconsistencia preexistente (preview del Builder)

Al implementar esto se encontró que `apps/web/components/form-preview.tsx` (preview en vivo del Builder) ya renderizaba las sub-opciones de **nivel 1** como radio (`type={level === 1 ? "radio" : "checkbox"}`) — basado en el nivel, no en un campo del schema — mientras el Runtime real (`evaluations/[token]/page.tsx`) las renderizaba **siempre** como checkbox, sin importar el nivel. Preexistente desde VS-016, sin impacto en datos guardados (el preview del Builder nunca persiste respuestas, es efímero). VS-040 hace que ambos componentes obedezcan el mismo campo explícito `subOptionsExclusive` (default `false` = checkbox, igual que el Runtime ya hacía) — corrige la inconsistencia en vez de preservarla. Documentado en `docs/project_notes/bugs.md`.

### Fuera de alcance (explícito)

- **`field`/`references`/exclusividad en sub-sub-opciones (nivel 2)** — solo `subOption` (nivel 1) gana estos campos; `subSubOption` sigue siendo `{ id, label }`. Sin caso observado que lo necesite; aditivo si aparece, mismo criterio que el resto de este documento.
- **`availableUnits` (selector de unidad) en el field tipo `numero`** — solo `unit` fijo opcional, sin selector. El caso observado (select de porcentaje) no lo necesita.
- **`visibleIf` sobre el field embebido** — misma limitación ya documentada para `references`.
- **Validación cruzada `field`/`subOptions` en la misma sub-opción** — el schema no impide que una sub-opción tenga simultáneamente `field` y sus propias `subOptions` (sub-sub-opciones); no hay caso observado que lo combine, pero tampoco se prohíbe por simplicidad.

### Notas de implementación

- **Export CSV**: mismo criterio que VS-039 — sin fila/columna nueva. El valor del `field` (resuelto a label si es `seleccion_desplegable`, literal si es texto/número) y las `references` de la sub-opción marcada se anexan a la celda `Respuesta` existente.
- **Builder/Runtime/preview**: mismos archivos que VS-039, extendidos: `subindicator-editor.tsx`, `evaluations/[token]/page.tsx` (`SubOptionsView`/`PreviewSubOptions` ganan modo excluyente + render de `field`/`references` embebidos), `form-preview.tsx`.

## Ajustes UX en referencias de URL (VS-041, implementado — 2026-08-14)

El usuario probó VS-039/VS-040 en producción y encontró dos problemas de UX (sin cambio de schema, solo de presentación/interacción):

1. **Orden visual**: cuando una sub-opción tenía a la vez `field`/`subOptions` y `references`, el bloque de referencias (URL) se renderizaba ANTES que las sub-opciones anidadas — `SubOptionsView`/`PreviewSubOptions` listaban `field → references → subOptions`. Corregido a `field → subOptions → references` (las referencias, como bloque de evidencia de apoyo, van al final — mismo orden que ya tenía el nivel raíz de `formOption`, que no necesitó cambio).
2. **Crecimiento automático de slots de URL**: `UrlPublicaView` (VS-017) y `OptionReferencesView` (VS-039/040) mostraban `respuestas guardadas + 1 slot vacío`, creciendo solo al escribir en el último slot — sin botón explícito. El usuario pidió que, en cambio, arranque en 1 slot visible y un botón **"Agregar URL"** explícito revele los siguientes, hasta `maxUrls` (ej. máx. 3 configurado → 1 inicial + hasta 2 adicionales vía botón). El preview del Builder (`form-preview.tsx`) además mostraba los `maxUrls` slots de golpe, en solo lectura — ahora es interactivo con el mismo patrón que el Runtime real.

### Implementación

- `apps/web/app/evaluations/[token]/page.tsx`: nuevo `UrlSlotsView` compartido (estado local `visibleCount`, arranca en `Math.max(urls.length, 1)`, botón "Agregar URL" hace `min(count+1, maxUrls)`, "Quitar" hace `max(count-1, 1)`) — `UrlPublicaView` y `OptionReferencesView` pasan a ser wrappers finos sobre este componente.
- `apps/web/components/form-preview.tsx`: nuevo `PreviewUrlList` (mismo patrón, interactivo) reemplaza los 3 bloques antes estáticos (`url_publica`, referencias de opción, referencias de sub-opción).
- Sin cambios de schema, respuesta ni export CSV — es un ajuste de presentación/interacción sobre datos que ya se guardaban igual.

### Testing

Verificado manualmente en navegador real (local y producción desplegada): una opción con sub-opción + referencias simultáneas muestra primero la sub-opción, luego (si se marca) el/los campo(s) de URL; el campo de URL arranca en 1 input, botón "Agregar URL" lo hace crecer hasta el máximo configurado, y desaparece al llegar al tope.

### Corrección posterior: posición configurable (mismo día)

El orden fijo `subOptions → references` elegido arriba resultó confuso: visualmente parecía que el campo de URL pertenecía a la ÚLTIMA sub-opción, no a la opción/sub-opción padre. Revisando de nuevo el HTML original de S&P (el mismo de VS-039): la fila de referencias vive **inmediatamente después del párrafo de la opción, ANTES de la sub-pregunta anidada** (`<p>...</p><div class="sims-input reference">...</div><ol>...</ol>`) — el orden correcto por defecto es `opción → references → subOptions`, no al revés.

Además, el usuario pidió control explícito: **"debo tener esta opción de poder mover en qué sitio deseo que aparezca el campo de URL"**. `references` gana `position`:

```ts
const optionReferences = z.object({
  maxUrls: z.number().int().positive().optional(),
  position: z.enum(["before_suboptions", "after_suboptions"]).optional(), // default: before_suboptions
});
```

- Reusado por `formOption.references` y `subOption.references` (ambos ya comparten el mismo objeto `optionReferences`) — sin duplicar el campo.
- **Default `before_suboptions`** (campo ausente = antes) — corrige el problema de confusión de raíz para todo `formSchema` existente sin necesitar migración.
- **Runtime/preview**: orden condicional — `references` se renderiza antes de `subOptions` salvo que `position === "after_suboptions"`. `field` (el control embebido de la sub-opción) siempre queda inmediatamente después del label, sin verse afectado por este toggle — es una extensión directa de la propia sub-opción, no un bloque de apoyo como `references`/`subOptions`.
- **Builder**: select "Posición de las URLs" (Antes de las sub-opciones / Después de las sub-opciones) junto al campo `Máximo de URLs`, tanto a nivel de opción como de sub-opción.
- Sin cambios en la clave de respuesta ni en export CSV.

## Tabla dentro de una sub-opción (VS-042, pendiente — spec doc-first)

Hallazgo de la 5.ª inspección (2026-08-14, HTML real de la pregunta `COG_BoardType_Selection` del portal S&P enviado por el usuario): cada sub-opción del sub-radio ("SISTEMA DE UN SOLO NIVEL" / "SISTEMA DE DOS NIVELES") contiene **su propia `table.form-table` completa** anidada dentro del `<li>` de la sub-opción. La plataforma actual permite a una sub-opción cargar `field` (un control simple: select/texto/número) o `references` (slots de URL), pero **no una tabla** — `tabla_datos` (VS-024) es un Elemento plano del Subindicador, no anidable.

### Decisión de diseño

`subOption` gana un campo opcional `table` (mismo shape que el Elemento `tabla_datos` — `columns`, `rows` — reutilizado, sin duplicación de tipos en zod):

```ts
const subOption = z.object({
  id: z.string().min(1),
  label: z.string(),
  subOptions: z.array(subSubOption).optional(),
  references: z.object({ maxUrls: z.number().int().positive().optional() }).optional(),
  field: subOptionField.optional(),
  table: tablaDatosConfig.optional(), // VS-042: tabla embebida (mismo shape que tabla_datos, sin label/visibleIf propios — hereda el de la sub-opción)
});
```

- **Compatible hacia atrás**: campo opcional, ningún `formSchema` existente cambia de forma; zod no exige el campo nuevo.
- **Respuesta**: misma convención de clave sintética: `` `${elementId}::${optionId}::${subOptionId}::table` `` → `TableValue` (mismo mapa `rowId -> columnId -> valor` que `tabla_datos`). Sin cambios en `response.ts`.
- **Runtime**: al marcar la sub-opción con `table`, se renderiza debajo la tabla completa (mismo `TableView` de `tabla_datos`, reutilizado tal cual con la clave un nivel más adentro). Si la sub-opción tiene a la vez `field` y `table`, orden: `field → table → subOptions → references` (consistente con VS-041: referencias al final).
- **Builder**: cada sub-opción gana un botón "Agregar tabla" que abre la misma UI de configuración de `tabla_datos` (columnas + filas con cellType/unit/options/maxLength), en modal o inline.

### Fuera de alcance (explícito)

- **`visibleIf` sobre la tabla embebida** — misma limitación ya documentada para `references`/`field`: las condiciones operan sobre Elementos, no sobre partes de una opción. La visibilidad de la tabla la gobierna la sub-opción (marcada = visible), igual que S&P.
- **Export CSV**: mismo criterio que VS-039/040 — sin fila/columna nueva; el contenido de la tabla (un `TableValue` completo) se anexa a la celda `Respuesta` existente (misma serialización de `tabla_datos`).

## Fila de fórmula dentro de una tabla (VS-043, pendiente — spec doc-first)

Mismo HTML de la 5.ª inspección: la última fila de cada tabla ("Tamaño total de la tabla" / "Tamaño total de ambos tableros") es un input **`readonly` con `class="formula"`** — valor calculado (suma) a partir de las celdas numéricas de la misma tabla, `data-dpd-name="COG_BoardType_BoardSize"`. La plataforma tiene el Elemento `calculado` (VS-013) a nivel de Subindicador con referencias a otros Elementos por `id`, pero `tabla_datos` no tiene filas calculadas ni el motor de fórmula puede referenciar celdas de tabla (`rowId.colId`).

### Decisión de diseño

`formTableRow.cellType` gana el valor `"calculado"` (además de `texto`/`numero`/`seleccion_desplegable`) con `expression` referenciando **celdas de la misma tabla**:

```ts
const formTableRow = z.object({
  id: z.string().min(1),
  label: z.string(),
  cellType: formTableCellType, // ahora incluye "calculado"
  expression: z.string().optional(), // solo si cellType === "calculado": sintaxis {rowId} + {rowId2} (celdas de la misma fila-objetivo en TODAS las columnas) o {rowId.columnId}
  ...
});
```

- **Sintaxis de la fórmula**: extensión del motor existente (`engine/formula.md` VS-013), referencias `{rowId}` (toda la fila, columna por columna) o `{rowId.columnId}` (celda puntual) dentro del **mismo Elemento tabla** — el parser actual (`parseFormula`) se reutiliza con un contexto nuevo de resolución de nombres (fila → valor por columna activa). No hay referencias entre Elementos distintos para filas calculadas (solo celdas de la misma tabla), por coherencia con la invariante "Subindicador = formulario independiente".
- **Evaluación**: por cada columna de la fila calculada, se evalúa la expresión contra los valores numéricos de las celdas referenciadas de esa misma columna; si alguna falta o hay división por cero, la celda queda vacía (mismo criterio que VS-013: `undefined` → clave ausente). La fila calculada se persiste como `TableValue` normal (el Runtime la escribe con autosave, el evaluado no la edita — `readonly` en UI).
- **Runtime**: celdas de fila `calculado` se renderizan como inputs `disabled` mostrando el valor recalculado en vivo (mismo patrón visual que el Elemento `calculado` de VS-013).
- **Builder**: al elegir `cellType: "calculado"` en una fila, aparece un campo `expression` con autocompletado de filas disponibles (`{rowId}`) y validación inline vía el parser existente.

### Fuera de alcance (explícito)

- **Funciones agregadas** (`SUM`, `AVG`, etc.) — mismo criterio que VS-013: aritmética directa con referencias explícitas; una `SUM` de rango no está pedida.
- **Fila calculada referenciando otros Elementos** — solo celdas de la misma tabla (el Elemento `calculado` de VS-013 ya cubre referencias entre Elementos).

## Tipo de celda mixto dentro de una fila (VS-044, pendiente — spec doc-first)

Mismo HTML de la 5.ª inspección: la tabla de "SISTEMA DE DOS NIVELES" tiene por fila `[texto, texto, número]` — columnas "Tipo de tablero"/"Tipo de director" con labels de texto y columna "Número de miembros" con inputs numéricos. `tabla_datos` (VS-024) define `cellType` **por fila uniforme** — decisión de diseño que previó exactamente este caso: *"Si en el futuro aparece un caso real con tipo mixto dentro de una fila, es un cambio aditivo (mover `cellType` de la fila a la celda), no un rediseño"*.

### Decisión de diseño

Mover `cellType` de la fila a la celda, **manteniendo el atajo por fila** para compatibilidad:

```ts
const formTableCell = z.object({
  columnId: z.string().min(1),
  cellType: formTableCellType, // texto | numero | seleccion_desplegable | calculado (VS-043)
  // config propia según cellType (unit/availableUnits/options/maxLength/expression)
});

const formTableRow = z.object({
  id: z.string().min(1),
  label: z.string(),
  cellType: formTableCellType.optional(),       // atajo legacy: aplica a TODAS las celdas de la fila (comportamiento VS-024)
  cells: z.array(formTableCell).optional(),     // nuevo: override por celda — si está presente, gana sobre cellType
  // config legacy (unit/availableUnits/options/maxLength/expression) sigue válida con cellType
});
```

- **Compatibilidad hacia atrás**: fila con solo `cellType` (sin `cells`) se comporta exactamente como hoy (VS-024/VS-041 no cambian de forma). `cells` es un override opcional para los casos mixtos; zod permite `cellType` y `cells` ausentes juntos solo si... (validación cruzada: al menos uno presente — `.superRefine()` en `formSchema`).
- **Runtime**: `TableView` resuelve el tipo por celda: `row.cells?.find(c => c.columnId === column.id) ?? row.cellType` — una sola rama de resolución, el resto del render no cambia.
- **Builder**: la UI de fila gana un modo "celdas individuales" (lista de columnas con selector de tipo por celda) alternativo al modo por-fila actual.

### Fuera de alcance (explícito)

- **Merge de celdas/rowspan** (la tabla de dos niveles tiene "Tipo de tablero" con celdas vacías que visualmente agrupan) — el HTML usa `<td></td>` vacíos, no `rowspan` real; si S&P lo usara, sería otro ítem aparte. Se replica con labels repetidos o celdas `texto` vacías.
- **Columnas dinámicas** (agregar columnas en Runtime) — fuera de alcance histórico, se mantiene.

## Ítems menores del mismo HTML (pendientes de priorizar)

Del mismo `COG_BoardType_Selection` (5.ª inspección), sin slice asignado todavía:

- **`data-ref-type="flexible"`**: la fila de referencias de la opción "Sí" es `flexible` (admite URL pública O referencia interna/documento), mientras VS-039 modeló solo URLs públicas (`refType: "public"` implícito). Si se quiere paridad, `formOptionReference` gana `refType: "public" | "flexible"` (aditivo) — el Runtime flexible pediría una fila de referencias con selector público/interno. **Preguntar al usuario si lo necesita** antes de especificar.
- **Patrón estándar de 4 opciones** (Sí / No / "No aplica" / "La información no está disponible"): ya construible hoy como opciones normales del radio (VS-019 cubre el N/A como checkbox universal, pero aquí N/A es simplemente otra opción del radio — nada que implementar).
