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

## Tabla embebida directamente en una opción de nivel superior (VS-060, verificado en producción)

Hallazgo del análisis de capacidad (2026-08-18, HTML real de `COG_GenderDiversity_Selection`, portal S&P, enviado por el usuario): la opción "Sí, la empresa informa..." de una pregunta `seleccion_unica` trae, anidados **directamente dentro del `<li>` de la opción** (sin ningún `<li>` de sub-radio intermedio): un bloque de referencias flexibles (`data-ref-type="flexible"`, ya soportado desde VS-039/045 vía `formOption.references`) y una `table.form-table` completa (columna "Métrica"/"Valor", fila "Número de directoras" con un campo numérico). VS-042 ya resolvió el caso de una tabla embebida en una **sub-opción** (`subOption.table`, un nivel de anidación más adentro que la opción misma), pero `formOption` — la opción de nivel superior de `seleccion_unica`/`seleccion_multiple`/`seleccion_desplegable` — no tiene ese campo: no había caso real observado hasta ahora de una tabla colgando directo de la opción, sin sub-radio de por medio.

### Decisión de diseño

`formOption` gana el mismo campo opcional `table` que ya tiene `subOption` desde VS-042 — mismo shape (`tablaDatosConfig`), mismo criterio de reuso sin duplicar tipos:

```ts
const formOption = formOptionBase.extend({
  subOptions: z.array(subOption).optional(),
  secondaryOptionsHeading: z.string().optional(),
  secondaryOptions: z.array(subOption).optional(),
  secondaryOptionsExclusive: z.boolean().optional(),
  table: tablaDatosConfig.optional(), // VS-060: tabla embebida directo en la opción (mismo shape que subOption.table de VS-042, un nivel menos de anidación)
});
```

- **Compatible hacia atrás**: campo opcional, ningún `formSchema` existente cambia de forma.
- **Respuesta**: misma convención de clave sintética ya usada por `references`/`subOptions` a este nivel: `` `${elementId}::${optionId}::table` `` → `TableValue`. Sin cambios en `response.ts`.
- **Runtime/Preview**: al marcar la opción con `table`, se renderiza debajo (mismo `FormTableView`/`PreviewTableView` ya reutilizado por `tabla_datos` y `subOption.table`). Orden dentro de la opción: `references (position !== "after_suboptions") → table → subOptions → secondaryOptions → references (position === "after_suboptions")` — `table` comparte el mismo criterio de posición que `subOptions`/`secondaryOptions` respecto al campo `references.position` de VS-041 (default = referencias primero). **Corrección posterior** (2026-08-18, mismo día, reportada por el usuario contra el HTML real de `COG_GenderDiversity_Selection`: el bloque de referencias flexibles va ANTES de la tabla, no después): la primera versión implementada renderizaba `table` de forma incondicional antes que las referencias "before_suboptions", ignorando `position` para la tabla — corregido moviendo el bloque de `table` a la posición intermedia (después de las referencias "before", antes de `subOptions`), igual que el resto del contenido anidado de una opción.
- **Builder**: mismo botón "Agregar tabla" → `TableConfigEditor` ya usado para `subOption.table`, ahora también disponible en el editor de cada opción de nivel superior (junto al bloque de "Agregar referencias" ya existente).
- **Export CSV/XLSX**: misma serialización que `subOption.table` (VS-042) — sin fila/columna nueva, el contenido se anexa a la celda `Respuesta` de la opción elegida. La lógica de serialización (antes solo en `formatSubOptionExtras`) se extrae a un helper compartido `formatEmbeddedTable`, reusado por `subOption.table` y `formOption.table` — el bloque de `tabla_datos` suelto en `formatAnswer` queda sin tocar (contrato de retorno distinto, sin necesidad real de unificarlo).

### Fuera de alcance (explícito)

- Mismas exclusiones ya documentadas para VS-042 (`visibleIf` sobre la tabla embebida).
- Un tercer nivel de anidación (tabla embebida dentro de `subSubOption`) — sin caso observado.

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

## Formato en preguntas y opciones + referencias flexibles (VS-045, pendiente — spec doc-first)

Hallazgo de la 6.ª inspección (2026-08-14, HTML real de la pregunta `COG_BoardIndependence_AttachmentBoardIndependenceStatement` del portal S&P enviado por el usuario):

1. **El texto de la pregunta y de las opciones lleva formato**: negritas (`<strong>`) y múltiples párrafos dentro del label de la pregunta y de los labels de las opciones (ej. "Las empresas **cotizadas** deben proporcionar enlaces…" / "Las empresas **no cotizadas** están obligadas a…"). Pegar ese texto en un input plano lo aplanaba a texto corrido — mismo problema que `banner.content` antes de VS-038.
2. **La fila de referencias de la opción "Sí" es `data-ref-type="flexible"` con `data-maxrefs="3"`**: admite URL pública O documento interno. VS-039 modeló solo URLs públicas (`refType: "public"` implícito); era ítem menor de la 5.ª inspección y el usuario pidió incluirlo.

Alcance confirmado con el usuario (`AskUserQuestion`): rich text en **todas** las preguntas y opciones, y **sí** incluir referencias flexibles en el mismo slice.

### Parte A — Labels con formato (rich text)

Alcance: label de **todos** los tipos de Elemento (incluidas `instruccion` y `calculado`; **excluido `banner.label`** — decisión VS-038 explícita, el título sigue siendo texto plano) + labels de **todas las opciones en todos los niveles** (`formOption`, `subOption`, `subSubOption`, opciones de `subOptionField`, opciones de fila de tabla) + labels de **columnas y filas de tabla** (`formTableColumn`/`formTableRow`). `helpText` queda texto plano (fuera de alcance, aditivo si se pide).

- **Sin cambio de tipo zod**: todos los labels siguen siendo `z.string()` — el string ahora es HTML sanitizado con la allowlist existente. VS-038 aplicó exactamente este criterio a `banner.content` (ver arriba): "no un tipo nuevo de dato, solo cambia qué significa esa cadena".
- **Motor reusado**: `packages/sdk-core/src/rich-text.ts` (`sanitizeCommentHtml`/`stripCommentHtml`, allowlist `strong`/`em`/`p`/`br`/`ul`/`li`). No se crea motor nuevo ni se extiende la allowlist.
- **Builder** (`subindicator-editor.tsx` y el editor legado de subindicadores directos): los `<input>` de label de Elemento/opción/sub-opción/columna/fila → `RichTextEditor` (mismo componente compartido del banner, ya reutilizable — paste con formato nativo de TipTap).
- **Runtime/Preview**: helper compartido nuevo `RichLabel` (o equivalente) que renderiza con `dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(value) }}` — se re-sanitiza en el borde de lectura (defensa en profundidad, mismo criterio que banner/comentario). Reemplaza **todos** los renders de label (pregunta, opción, sub-opción, columna, fila, opción de select).
- **Export CSV**: `stripCommentHtml` sobre cada label al serializar (opción elegida, opciones de selección múltiple, etc.).
- **Sin migración de datos**: labels existentes en texto plano son HTML válido sin markup — se ven idénticos.

### Parte B — Referencias flexibles

`optionReferences` gana `refType`:

```ts
const optionReferences = z.object({
  maxUrls: z.number().int().positive().optional(), // default 3 (límite observado en S&P)
  position: z.enum(["before_suboptions", "after_suboptions"]).optional(),
  refType: z.enum(["public", "flexible"]).optional(), // VS-045: default "public" (comportamiento VS-039)
});
```

- **Compatible hacia atrás**: ausente = `public` (comportamiento actual). Un solo `refType` por bloque — S&P define el tipo a nivel de bloque, no por slot.
- **Forma de respuesta**: la clave `` `${elementId}::${optionId}::refs` `` (y la de sub-opción, `` `${subKey}::${sub.id}::refs` ``) pasa a aceptar slots mixtos `(string | EvidenceRef)[]` — URL literal (public) o `EvidenceRef` (documento interno). `answerValue` gana el branch `z.array(z.union([z.string(), evidenceRef]))`; los arrays de strings guardados antes siguen validando (cada elemento valida contra la unión) — sin migración.
- **Runtime** (`OptionReferencesView`): con `refType: "flexible"`, cada slot muestra un mini-select "URL pública / Documento interno"; en modo documento, mini-flujo de adjunto reutilizando el patrón de `evidencia` (upload directo a R2 con presigned URL — `docs/engines/evidences.md`; solo las refs `{key,name,size,mimeType}` viven en la Respuesta, el binario no pasa por el servidor Next.js). El slot guarda la `EvidenceRef` completa.
- **Export CSV**: slot `string` → literal; slot `EvidenceRef` → `[Archivo: {name}]` (el binario no viaja en el CSV, mismo criterio que `evidencia`).
- **Builder**: el bloque de configuración de referencias (opción y sub-opción) gana el selector "Tipo de referencia: URL pública / Flexible".

### Fuera de alcance (explícito)

- **`helpText` y `banner.label` con formato** — texto plano (aditivo si se pide).
- **Previsualización/descarga del documento interno desde Revisión o CSV** — los binarios se descargan por el flujo de evidencias existente; el CSV lista nombres.
- **Límites por tipo en flexible** (`maxRefsPublic`/`maxRefsDocs`) — `maxUrls` aplica a la suma de slots.
- **Reuso de un documento entre respuestas** — cada slot sube su propio archivo.
- **`data-non-listed` y otros atributos del bloque de S&P** sin contraparte funcional.

### Tests

- `packages/sdk-core`: `form-schema.test.ts` (refType válido/ausente/inválido + default), `response.test.ts` (union mixta acepta `string[]` legacy y array mixto), `rich-text.test.ts` ya cubre sanitize/strip (sin cambios).

## Tipo de celda mixto dentro de una fila (VS-044, implementado 2026-08-15)

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

- **Compatibilidad hacia atrás**: fila con solo `cellType` (sin `cells`) se comporta exactamente como hoy (VS-024/VS-041 no cambian de forma). `cells` es un override opcional para los casos mixtos; la validación cruzada (al menos uno presente) se implementa con `.superRefine()` en **`formTableRow`** — desviación menor de la spec original (que lo ponía en `formSchema`) para cubrir también la tabla embebida de VS-042, cuyo schema raíz no es `formSchema`.
- **Runtime**: `TableView` resuelve el tipo por celda: `row.cells?.find(c => c.columnId === column.id) ?? row.cellType` — una sola rama de resolución, el resto del render no cambia. Fallback implícito "texto" cuando la celda no tiene config (resolución desde la fila sin `cellType`).
- **Builder**: la UI de fila gana un modo "celdas individuales" (lista de columnas con selector de tipo por celda) alternativo al modo por-fila actual. **Decisión**: el modo por celda NO ofrece `availableUnits` (la unidad por celda es fija `unit`; la selección de unidad en Runtime sigue siendo por fila — misma clave de respuesta), evitando un select que no existe en Runtime.
- **Export CSV**: helper `cellConfig(row, columnId)` normaliza el shape legacy de fila al de celda (unit/availableUnits/options/maxLength), así legacy y `cells` pasan por el mismo serializador; la unidad de celda se respeta.

### Fuera de alcance (explícito)

- **Merge de celdas/rowspan** (la tabla de dos niveles tiene "Tipo de tablero" con celdas vacías que visualmente agrupan) — el HTML usa `<td></td>` vacíos, no `rowspan` real; si S&P lo usara, sería otro ítem aparte. Se replica con labels repetidos o celdas `texto` vacías.
- **Columnas dinámicas** (agregar columnas en Runtime) — fuera de alcance histórico, se mantiene.

## Ítems menores del mismo HTML (pendientes de priorizar)

Del mismo `COG_BoardType_Selection` (5.ª inspección), sin slice asignado todavía:

- **`data-ref-type="flexible"`**: la fila de referencias de la opción "Sí" es `flexible` (admite URL pública O referencia interna/documento), mientras VS-039 modeló solo URLs públicas (`refType: "public"` implícito). **Implementado en VS-045** (`optionReferences.refType: "public" | "flexible"`, default `public`) — ver spec VS-045 arriba.
- **Patrón estándar de 4 opciones** (Sí / No / "No aplica" / "La información no está disponible"): ya construible hoy como opciones normales del radio (VS-019 cubre el N/A como checkbox universal, pero aquí N/A es simplemente otra opción del radio — nada que implementar).

## Bloque secundario de sub-opciones por opción (VS-046, implementado 2026-08-15)

Re-análisis en profundidad del mismo HTML de VS-045 (`COG_BoardIndependence_Selection`, pregunta completa — `COG_BoardIndependence_AttachmentBoardIndependenceStatement` es solo el bloque de referencias de su opción "Applicable"), pedido explícito del usuario ("analiza esta pregunta... valida en producción que sea capaz de crear una igual"). **Corrige una conclusión errónea de la 6.ª inspección**: la nota del 2026-08-14 en `../analysis/csa-sp-global-comparison.md` (línea junto a la spec VS-045) decía que el segundo grupo de checkboxes visto en ese HTML ("Distribución de objetivos") ya era "construible con VS-016/VS-040, sin gap nuevo" — una lectura apresurada del DOM que no siguió con cuidado el prefijo de los `id`. No lo es: se verificó tanto por el schema (`packages/sdk-core/src/form-schema.ts`) como en vivo contra el Builder desplegado en producción (`csa-v3-web.vercel.app`, framework temporal `TEMP - análisis pregunta BoardIndependence`, borrado al terminar).

### Hallazgo

Bajo la opción "Applicable" (`st1sc1cc1`) del radio raíz, el DOM tiene **dos `<ol>` hermanos independientes**, ambos hijos directos del mismo `div.level` de la opción (no uno anidado dentro del otro):

1. `st1sc1cc1st1sc1` (`COG_BoardIndependence_StockExchange`) — sub-radio excluyente de 2 sub-opciones: "Acceptable CG Code" (con `<select>` embebido) y "Own Independence Requirements" (con 9 checkboxes de criterios, sub-sub-opciones). Esto **ya es representable** hoy: `formOption.subOptions` + `subOptionsExclusive: true` (VS-040) + `subOption.field` tipo `seleccion_desplegable` (VS-040) + `subOption.subOptions` de 9 checkboxes (VS-026).
2. `st1sc1cc1st1mc1` ("Distribución de objetivos", encabezado en `<strong>` propio) — grupo de checkboxes **separado**, con un único ítem "TargetShare" que trae su propio campo de texto embebido (`data-maxchars="1000"`). Representable de forma aislada (`subOption.field` tipo `texto_corto`, VS-040) — **el problema no es el contenido del ítem, es que no hay dónde colgarlo**: es un segundo grupo, con su propio encabezado y su propia exclusividad (checkbox, no radio), hermano del sub-radio de StockExchange, no un tercer ítem dentro de él.

`formOption` (`form-schema.ts`) solo tiene **un** campo `subOptions` (con **un** `subOptionsExclusive` que gobierna todo el array) — no hay forma de adjuntar un segundo bloque de sub-opciones, con su propio encabezado y su propia exclusividad, a la misma opción. Confirmado en el Builder de producción: el panel de una opción ofrece exactamente un checkbox "Sub-opciones excluyentes", un botón "Agregar sub-opción" (que agrega ítems al mismo array) y un botón "Agregar referencias" — ningún control para iniciar un segundo grupo independiente.

### Decisión de diseño

`formOption` gana un segundo bloque opcional, mismo shape que `subOptions` (reusa `subOption` tal cual, sin nuevo tipo zod) pero con su propio encabezado y exclusividad — **fijo en 2 bloques, no un array genérico de N grupos**: sin evidencia de un tercer bloque en ningún HTML inspeccionado hasta ahora, mismo criterio ya usado en este documento para el tope de sub-opciones a 2 niveles (VS-026: "tope fijo, no recursión genérica... aditivo si aparece un caso real de un nivel más").

```ts
const formOption = formOptionBase.extend({
  subOptions: z.array(subOption).optional(),
  // VS-046: segundo bloque de sub-opciones, HERMANO de `subOptions` (no
  // anidado dentro de él) — caso real: la opción "Applicable" trae un
  // sub-radio (StockExchange) Y, por separado, un grupo de checkboxes con
  // encabezado propio ("Distribución de objetivos"). Mismo shape que
  // subOptions/subOptionsExclusive, prefijo `secondary` para distinguirlos.
  secondaryOptionsHeading: z.string().optional(), // ej. "Distribución de objetivos" — HTML sanitizado, mismo motor que el resto de labels (VS-045)
  secondaryOptions: z.array(subOption).optional(),
  secondaryOptionsExclusive: z.boolean().optional(), // default false (checkbox/múltiple), independiente de subOptionsExclusive
});
```

- **Compatible hacia atrás**: los 3 campos son opcionales; ningún `formSchema` existente cambia de forma.
- **Orden de render**: `references (antes) → subOptions → secondaryOptions → references (después)` — coincide con el HTML real (la fila de referencias de "Applicable" antecede al sub-radio de StockExchange, que a su vez antecede a "Distribución de objetivos"). Sin campo de posición configurable para `secondaryOptions` (a diferencia de `references`, VS-041): no hay caso observado que lo necesite antes del bloque primario, aditivo si aparece.
- **Respuesta**: misma convención de clave sintética que el resto del motor, con un segmento `secondary` para no colisionar con las claves de `subOptions`: `` `${elementId}::${optionId}::secondary::${subOptionId}` `` (marca de selección — `string` si `secondaryOptionsExclusive`, `string[]` si no) y, para campos embebidos de un ítem de ese bloque, `` `${elementId}::${optionId}::secondary::${subOptionId}::field` `` / `::refs` / `::table` (mismos sufijos que ya existen para `subOptions`, VS-040/042). Sin cambios en `response.ts`.
- **Runtime/Builder**: el componente existente que renderiza `subOptions` (`SubOptionsView` en Runtime, su equivalente en `form-preview.tsx`, y el bloque de Builder en `subindicator-editor.tsx`) se parametriza por `(keyPrefix, heading?, options, exclusive)` en vez de asumir siempre `subOptions`/`subOptionsExclusive` — se invoca una segunda vez con el prefijo `secondary` cuando `secondaryOptions` está presente, reusando el mismo componente (no uno nuevo). Builder: la opción gana un botón "Agregar bloque secundario de sub-opciones" (junto a "Agregar sub-opción"/"Agregar referencias") que revela el campo de encabezado + el mismo checkbox "excluyentes" + el mismo CRUD de sub-opciones, ahora aplicado al segundo array.
- **Export CSV**: mismo criterio que `subOptions` (VS-016) — sin fila/columna nueva; ítems marcados de `secondaryOptions` (label + campo embebido si tiene) se anexan a la celda `Respuesta` existente con el mismo separador `"; "`.

### Fuera de alcance (explícito)

- **Un tercer bloque, o un array genérico de N bloques nombrados** — sin caso observado; si aparece, es aditivo (repetir el patrón), no un rediseño (mismo criterio que sub-opciones a 2 niveles).
- **`secondaryOptions` en `subOption` (nivel 2) o en filas de tabla** — solo `formOption` (nivel raíz de la pregunta) gana este campo; no hay evidencia de un caso de doble bloque más profundo.
- **`visibleIf` sobre el bloque secundario** — misma limitación ya documentada para `references`/`field`/`subOptions`: las condiciones operan sobre Elementos completos.
- **Posición configurable de `secondaryOptions` relativa a `subOptions`** — orden fijo (ver "Decisión de diseño"), a diferencia de `references` (VS-041). Aditivo si un caso real lo requiere.

### Corrección de `docs/analysis/csa-sp-global-comparison.md`

La nota de la 6.ª inspección (2026-08-14) en ese archivo afirma que este caso "ya es construible con VS-016/VS-040, sin gap nuevo" — incorrecto, ver "Hallazgo" arriba. Se agrega una nota de corrección en el mismo archivo (no se borra el texto original, mismo criterio de preservar el historial que el resto de este documento).

### Implementación (2026-08-15)

- `packages/sdk-core/src/form-schema.ts`: `formOption` gana `secondaryOptionsHeading`/`secondaryOptions`/`secondaryOptionsExclusive` exactamente como en "Decisión de diseño" arriba. 6 tests nuevos en `form-schema.test.ts` (compatibilidad hacia atrás, bloques hermanos con `subOptions` + `secondaryOptions` simultáneos, exclusividad independiente, array vacío, item sin id).
- **Runtime** (`apps/web/app/evaluations/[token]/page.tsx`): `SubOptionsView` (ya genérico por `subKey`/`exclusive`) gana un prop opcional `heading` — sin tocar su lógica de field/table/references/sub-sub-opciones, que ya funcionaba para cualquier array de `subOption` que se le pasara. Se invoca una segunda vez con `subKey: `${elementId}::${optionId}::secondary``, `exclusive: opt.secondaryOptionsExclusive`, después del bloque `subOptions` y antes de `references` en posición `after_suboptions` — mismo orden documentado arriba.
- **Preview** (`apps/web/components/form-preview.tsx`): mismo tratamiento en `PreviewSubOptions` (prop `heading` + segunda invocación).
- **Builder** (`apps/web/components/subindicator-editor.tsx`): las funciones CRUD de `subOptions` (`addSubOption`/`updateSubOption`/`removeSubOption`/`addSubSubOption`/`updateSubSubOption`/`removeSubSubOption`/`updateSubOptionNode` y sus ~12 derivadas de field/table/references) ganaron un parámetro `block: "subOptions" | "secondaryOptions" = "subOptions"` en vez de duplicarse — todo call-site existente sigue igual (default preserva el comportamiento), el bloque secundario nuevo pasa `"secondaryOptions"` explícito. Nuevas: `addSecondaryOptionsBlock`/`removeSecondaryOptionsBlock` (inicia/quita el bloque entero), `updateSecondaryOptionsHeading`, `toggleSecondaryOptionsExclusive` (nombre de campo distinto a `subOptionsExclusive`, no comparte `block`). Botón "Agregar bloque secundario de sub-opciones" por opción, con encabezado (RichTextEditor), checkbox de exclusividad propio y el mismo CRUD de sub-opciones (label + campo embebido select/texto/número + referencias URL) que el bloque primario.
- **Export CSV**: `formatOptionLabel` factoriza la resolución de sub-opciones marcadas en `formatMarkedSubOptions(subOptions, key, answers)`, reusada para `opt.subOptions` (clave `${optKey}`) y `opt.secondaryOptions` (clave `${optKey}::secondary`) — ambas listas de partes se concatenan en el mismo sufijo `" — a; b; c"` de la celda Respuesta, mismo criterio "una fila por Elemento".
- **Alcance reducido en el Builder** (desviación menor, documentada aquí en vez de en el schema): los ítems del bloque secundario soportan label, campo embebido (`field`) y referencias (`references`) desde la UI — cubre el caso real (`TargetShare` con `field: texto_corto`). **Tabla embebida (`table`) y sub-sub-opciones (`subOptions` de 2do nivel) dentro de un ítem de `secondaryOptions` no tienen UI propia en este slice**, aunque el tipo (`subOption` reusado tal cual) y el Runtime/Preview (genéricos, sin distinguir el bloque de origen) ya los soportan si se cargaran por otra vía — aditivo si aparece un caso real que los necesite, mismo criterio "no diseñar para hipotéticos" del resto de este documento.
- 242 tests en `sdk-core` (antes 237), `pnpm typecheck`/`build`/`test` en verde.

### Verificación en producción (2026-08-15)

Commit `0c1272d` + push a `main`, deploy Vercel READY (`dpl_GFzKYPakbM8qPTniiThBRR6XwvRr`, alias `csa-v3-web.vercel.app`). Framework temporal "TEMP - VS-046 verificacion produccion" (creado y borrado en esta verificación, con confirmación explícita): elemento `seleccion_unica` con opción "Applicable" — botón "Agregar bloque secundario de sub-opciones" visible y funcional en el Builder, encabezado "Distribución de objetivos" + checkbox "excluyentes" + ítem con campo embebido `texto_corto` (máx. 1000). Preview del Builder: heading en negrita + checkbox + input de texto al marcar. Runtime público (`/evaluations/RLHX1jApGPli63Co7gws6sI8ox0lmgjV`): mismo render, autosave ("Guardado"), **persistencia confirmada tras recarga completa desde cero** (radio "Applicable", checkbox marcado y valor "40%" del campo embebido, todos conservados). Export CSV: `"Applicable — La empresa tiene una participación objetivo de directores independientes en el consejo (40%)"` — serialización correcta del ítem del bloque secundario anexado a la celda Respuesta.

### Estado

Implementado y verificado en producción. Cerrado.

## Editor de `tabla_datos` estilo grilla (VS-047, pendiente — spec doc-first)

Pedido explícito del usuario sobre el mismo HTML de la 5.ª inspección (`COG_BoardType_BoardType`, ya construible desde VS-042/043/044): la construcción de una tabla en el Builder de hoy (dos listas separadas, "Columnas" y "Filas", con el tipo de celda configurado por fila o por celda vía un modo alternante) **no se siente intuitiva** — demasiados campos, sin relación visual con la tabla resultante. Pedido: que se sienta como armar una hoja de cálculo — arrancar de una celda, poder "agregar a la derecha"/"agregar debajo", escribir contenido directo en la celda, elegir si es editable (la llena el evaluado) o de solo lectura (contenido fijo que solo el admin escribe), y poder quitar celdas puntuales — algunas columnas necesitan menos filas que otras (el HTML real de "SISTEMA DE DOS NIVELES" tiene celdas `<td></td>` vacías que simulan un `rowspan`, ya documentado como "fuera de alcance" en VS-024/044 con el workaround "celdas de texto vacías" — este slice hace ese workaround intuitivo en vez de forzado).

### Hallazgo adicional durante el análisis: VS-043 nunca se conectó a la UI

Al revisar el código actual de `FormTableView`/`PreviewTableView`/`TableConfigEditor` para planear este rediseño, `evaluateTableExpression` (el motor de VS-043, ya implementado y testeado en `packages/sdk-core/src/formula.ts`) **no aparece en ningún archivo de `apps/web`** — ni Runtime, ni preview, ni Builder. El registro de VS-043 (`docs/CHANGELOG.md`, `docs/checkpoints/CHECKPOINT.md`, `docs/project_notes/issues.md`) documenta "Runtime con input disabled + valor recalculado en vivo" y "Builder `TableConfigEditor` con campo `expression` y autocompletado" como implementados y verificados en producción con IDs de evaluación específicos — pero el código real nunca tuvo esa rama. El schema (`formTableCellType` incluye `"calculado"`, `expression`, `.superRefine()`) y el motor puro (`evaluateTableExpression`, con tests unitarios) sí existen y funcionan; lo que falta es exclusivamente la integración en Runtime/Preview/Builder. Se corrige como parte de este slice, ya que se está reescribiendo exactamente esos tres archivos. Registrado como hallazgo en `docs/project_notes/bugs.md` (no se investiga más a fondo cómo se originó el registro incorrecto — fuera de alcance de este slice).

### Decisión de diseño

**Se mantiene el modelo `columns[] × rows[]`** (no se reemplaza por un grid libre de coordenadas) — los encabezados de columna/fila siguen siendo texto fijo administrado aparte (`column.label`/`row.label`), igual que hoy; lo que cambia es cómo se editan las celdas de datos y qué puede contener cada una. Se prefiere esto a una reescritura completa del modelo de datos porque: (a) preserva 100% de las tablas ya publicadas sin migración, (b) preserva la fórmula `{rowId}`/`{rowId.columnId}` de VS-043 y la serialización de export ya construidas sobre filas/columnas con identidad estable, (c) el pedido del usuario ("una columna con menos filas que otras") se resuelve con celdas individuales opcionales por fila, sin necesitar coordenadas libres — mismo criterio "cambio aditivo, no rediseño" del resto de este documento.

```ts
// packages/sdk-core/src/form-schema.ts
const formTableCell = z.object({
  columnId: z.string().min(1),
  cellType: formTableCellType, // incluye "calculado", ya existía (VS-043/044)
  expression: z.string().optional(),
  editable: z.boolean().optional(), // VS-047: default true (ausente = editable). false = contenido fijo del admin.
  content: z.string().optional(), // VS-047: HTML sanitizado (mismo motor que el resto de labels, VS-045) — el valor fijo que ve el evaluado cuando editable === false. Se ignora si editable !== false.
  unit: z.string().min(1).optional(),
  availableUnits: z.array(z.string().min(1)).min(1).optional(),
  options: z.array(formOptionBase).min(1).optional(),
  maxLength: z.number().int().positive().optional(),
});
```

- **`editable`** ya estaba parcialmente agregado (hallazgo de este análisis, sin usar en ningún consumidor) — se formaliza como `z.boolean().optional()` (no `.default()`, para no forzar el campo en cada literal existente del código — un valor ausente se trata como `true` en todos los consumidores, igual patrón que `subOptionsExclusive`/`startCollapsed` en el resto del motor).
- **`content`** es nuevo: solo tiene efecto cuando `editable === false`. Reusa `sanitizeCommentHtml`/`RichLabel`, mismo motor que todos los labels desde VS-045 — permite negritas/párrafos en el contenido fijo (ej. simular un encabezado de sub-grupo como "Consejo de supervisión" repetido visualmente sin depender de `rowspan`).
- **Sin validación cruzada en el schema** (`content` requerido solo si `editable === false`, etc.) — mismo criterio de costo/beneficio ya usado para `options` en `seleccion_desplegable` de celda (VS-024): lo exige el Builder como regla de UI, no zod.

### Celda en blanco (raggedness) — nueva semántica de resolución

Hoy: `row.cells?.find(c => c.columnId === col.id) ?? row` — si no hay override para una columna, la celda usa siempre el `cellType` de la fila (nunca queda vacía). Esto no permite que una columna tenga menos filas pobladas que otras.

**Nueva regla, aditiva**: cuando `row.cellType` está **ausente** (fila en "modo celdas", ver VS-044) y no hay ninguna entrada en `row.cells` para esa columna → la celda se renderiza **vacía** (`<td>` sin control, ni input ni contenido) en vez de caer a un input de texto por defecto.

- **Compatibilidad total con datos existentes**: toda tabla ya publicada con filas en modo celdas (VS-044) tiene, por construcción del Builder anterior, una entrada en `cells` para **cada** columna (`addColumn` agregaba una celda "texto" a cada fila existente) — nunca hay un hueco, así que esta regla nunca cambia el render de una tabla ya guardada. Solo aplica a tablas nuevas construidas con el editor de grilla de este slice, donde admin puede quitar una celda puntual dejándola en blanco a propósito.
- Una fila con `row.cellType` **presente** (atajo legacy, uniforme) sigue exactamente igual que hoy — nunca queda en blanco, cualquier columna sin override usa el tipo de la fila.

### Runtime (`FormTableView`) y preview (`PreviewTableView`)

Misma resolución en ambos, por celda:
1. Si `cellCfg` no existe (caso de blank arriba) → `<td>` vacío, sin control.
2. Si `cellCfg.editable === false` → `<td>` con `<RichLabel html={cellCfg.content ?? ""} />` (contenido fijo, sin input — el evaluado lo ve pero no lo edita, mismo criterio visual que un `<th>` pero dentro del cuerpo de la tabla).
3. Si `cellCfg.cellType === "calculado"` (VS-043, recién conectado) → mismo patrón que el Elemento `calculado` suelto (`CalculadoView`, VS-013): input `disabled` con el valor recalculado en vivo vía `evaluateTableExpression(cellCfg.expression, col.id, valuesPorFila)`, persistido con `useEffect` + autosave cuando cambia, `toFixed(2)` para display. El contexto de resolución de `{rowId}`/`{rowId.columnId}` es el mismo `TableValue` completo del elemento.
4. Si no, el input/select existente según `cellType` (sin cambios respecto a hoy).

### Builder (`TableConfigEditor`) — grilla real

Reemplaza las dos listas separadas ("Columnas" / "Filas") por una única tabla HTML que refleja visualmente la estructura resultante:

- **Encabezado de columna**: cada `<th>` es el `RichTextEditor` de `column.label` + botón "Quitar columna"; al final de la fila de encabezados, un botón **"+" (Agregar columna a la derecha)** — agrega una columna nueva y, para no romper la grilla visualmente, agrega automáticamente una celda vacía-editable-texto en cada fila existente (equivalente a "Excel extiende la hoja"; el admin puede quitarlas puntualmente después si quiere una columna más corta).
- **Encabezado de fila**: cada `<th scope="row">` es el `RichTextEditor` de `row.label` + botón "Quitar fila"; debajo de la última fila, un botón **"+" (Agregar fila abajo)** con el mismo criterio (agrega una celda vacía-editable-texto por columna existente).
- **Celda del cuerpo** (`row × column`): dos estados—
  - **Vacía** (sin entrada en `row.cells` para esa columna): un botón discreto "+" centrado que, al hacer clic, crea la celda ahí mismo (`cellType: "texto"`, `editable: true`) — este es el punto de entrada real de "agregar celda aquí" que pidió el usuario, resuelto como clic directo sobre el hueco en vez de un botón "agregar a la derecha/abajo" ANCLADO a una celda específica (que exigiría reordenar columnas/filas para insertar en el medio, no solo al final — fuera de alcance, ver abajo).
  - **Ocupada**: chip compacto con el tipo (`Texto`/`Número`/`Selección`/`Calculado`) y si es editable/solo-lectura, expandible (`<details>`, mismo patrón ya usado en el resto del Builder para no saturar la vista) a los controles: selector de tipo, toggle "Editable / Solo lectura", y según el caso — `content` (RichTextEditor, si solo-lectura), `maxLength`/`unit`+`availableUnits`/`options`/`expression` (si editable, según `cellType`, reusando los mismos sub-controles que ya existían por-fila). Botón "×" quita la celda puntual (vuelve a vacía, no borra la fila/columna).
- **Elemento nuevo `tabla_datos`**: el default cambia de `rows: [{ cellType: "texto" }]` (modo legacy uniforme) a `rows: [{ cells: [{ columnId, cellType: "texto", editable: true }] }]` (modo celdas desde el inicio) — un grid de 1×1 al crear el elemento, coherente con "empezar de una celda".
- **Tabla embebida en sub-opción** (`subOption.table`, VS-042): mismo `TableConfigEditor`, sin cambios adicionales — ya es el mismo componente reusado.

### Fuera de alcance (explícito)

- **Editor legado de subindicadores directos bajo Dimensión** (`apps/web/app/frameworks/[frameworkId]/dimensions/[dimensionId]/subindicators/[subindicatorId]/page.tsx`): tiene su propia implementación duplicada de `tabla_datos`, nunca actualizada más allá de VS-024 (uniforme por fila, sin `cells` override — ni siquiera llegó a VS-044). Queda tal cual en este slice; una tabla creada ahí sigue viéndose/comportándose en modo legado. Aditivo si se pide traerla a paridad — mismo criterio de alcance que otras veces que este editor legado quedó rezagado.
- **Insertar columna/fila en una posición intermedia** (no solo al final) — el pedido del usuario es "agregar a la derecha/abajo" desde el borde de la grilla, no reordenar; si aparece un caso real que lo necesite, es aditivo (agregar índice de inserción a `addColumn`/`addRow`), no rediseño.
- **`rowspan`/`colspan` real** (fusión visual de celdas) — sigue resuelto con celdas en blanco (ahora más fácil de lograr) o `content` fijo repetido, mismo criterio ya documentado en VS-024/044.
- **Arrastrar para expandir un rango** (autofill estilo Excel) — no pedido explícitamente, aditivo si se pide.
- **Copiar/pegar celdas** — no pedido, aditivo si se pide.

### Notas de implementación

- **Export CSV**: sin cambios de forma — `formatAnswer` de `tabla_datos` sigue serializando `"fila: col1=v1, col2=v2; ..."`, pero ahora omite del lado derecho las celdas con `editable === false` (nada que el evaluado haya respondido, mismo criterio "el CSV exporta respuestas" del resto del motor) y las celdas en blanco (sin valor posible). Las celdas `calculado` se serializan igual que `numero` (ya se persisten con autosave).
- **Sin cambios en `response.ts`**: `TableValue` ya es un mapa disperso (`rowId -> columnId -> valor`), una celda sin entrada ya significa "sin valor" — la raggedness no necesita ensanchar `AnswerValue`.
- **Tests**: `form-schema.test.ts` gana casos para `content`/`editable` (con y sin valor, compatibilidad hacia atrás) — sin caso nuevo para la semántica de blank porque esa es responsabilidad del Runtime/Preview, no del schema (el schema ya permite `cells` con menos entradas que `columns`, no hay nada que validar ahí).

### Verificación en producción (2026-08-15)

Commit `c2ec968` + push a `main`, deploy Vercel READY (el webhook GitHub→Vercel volvió a demorarse ~10 min sin disparar — mismo síntoma ya documentado; se forzó con "Create Deployment" desde el dashboard, ya READY como Production antes de necesitarlo). Framework temporal "TEMP - VS-047 verificacion produccion" (creado en esta verificación): elemento `tabla_datos` con la grilla 1×1 inicial confirmada (celda "Texto" + botones "+ columna"/"+ fila" en los bordes), construida hasta reproducir la tabla real "SISTEMA DE UN SOLO NIVEL" — 3 filas numéricas + fila `calculado` con fórmula armada con los chips de autocompletado (`{id1}+{id2}+{id3}`, sin error de sintaxis). Runtime público: celda calculada renderizada `disabled` con "(sin calcular)" antes de llenar datos; al escribir 4/6/2 en las tres filas, "Tamaño total de la tabla" mostró **12** en vivo con autosave ("Guardado"); **persistencia confirmada tras recarga completa desde cero** (los 4 valores, incluido el calculado, se conservaron). Framework temporal borrado con confirmación explícita del usuario.

### Estado (VS-047)

Implementado y verificado en producción. **Superado por VS-048** (más abajo) — la decisión de diseño "se mantiene columns[]×rows[] con label" resultó no reflejar el pedido del usuario; VS-048 la reemplaza con una grilla uniforme sin encabezados especiales. Esta sección queda como registro histórico de la decisión original y por qué se descartó, no como spec vigente.

## Grilla uniforme sin encabezados especiales (VS-048, supersede la decisión de diseño de VS-047 — implementado 2026-08-16)

**Reporte del usuario tras probar VS-047 en producción**: "sigo sin ver lo que te pedí. Mi pedido fue que aparezca una sola celda, luego el usuario admin puede ir añadiendo celdas según requiera, sea para la derecha o para abajo. Ya que con el estilo actual, por ejemplo no podría armar una tabla doble entrada, ya que la celda superior izquierda nunca existe."

VS-047 preservó el modelo `columns[] × rows[]` con `column.label`/`row.label` como conceptos separados de las celdas de datos — el Builder renderiza una fila de encabezados de columna (`<thead>`) y una columna de encabezados de fila (`<th scope="row">` por fila) SIEMPRE, con la esquina superior izquierda como un `<th />` vacío estructural, nunca una celda real. Eso contradice el pedido original ("aparezca una sola celda... para la derecha o para abajo"): lo que apareció fue un esqueleto de 2×2 con tres huecos ya presentes (encabezado de columna, encabezado de fila, esquina en blanco) más una celda de dato — no una sola celda. Y para una tabla de doble entrada real (cross-tab, ej. "Región × Año" con la esquina mostrando "Región / Año" o quedando vacía a propósito) la esquina nunca es direccionable: no se le puede poner contenido, tipo, ni quitarla.

### Decisión de diseño

**Se elimina la distinción entre "encabezado" y "celda de dato".** Una tabla es una grilla uniforme de celdas — CUALQUIER celda, incluida la que ocupa la posición (fila 0, columna 0), es una celda real y direccionable con el mismo control que cualquier otra: tipo (`texto`/`numero`/`seleccion_desplegable`/`calculado`), editable (la llena el evaluado) o solo lectura (contenido fijo que escribe el admin). Si el admin quiere que una celda actúe como encabezado de fila o columna, la marca "solo lectura" con el texto que corresponda — exactamente el mismo mecanismo `editable: false` + `content` que ya existe desde VS-047 para cualquier celda, sin un concepto nuevo.

Confirmado con el usuario (`AskUserQuestion`, 2026-08-16): grilla uniforme sin encabezados especiales, y rediseño limpio del schema sin necesidad de migrar datos — no hay evaluaciones reales contestadas sobre `tabla_datos` en producción, todos los frameworks que la usan son de prueba (`TEMP -`, `VS-0xx verificación`).

```ts
// packages/sdk-core/src/form-schema.ts
const formTableColumn = z.object({
  id: z.string().min(1),
  // VS-048: sin `label` — la grilla es uniforme, cualquier celda (incluida
  // la esquina) puede actuar como encabezado marcándola "solo lectura" con
  // contenido; no hay un concepto de "columna con etiqueta" aparte de las
  // celdas. `id` es solo identidad/orden estable (usada por `cells[].columnId`
  // y por las referencias `{rowId.columnId}` de la fórmula, VS-043).
});

const formTableRow = z.object({
  id: z.string().min(1),
  cells: z.array(formTableCell).min(1),
  // VS-048: sin `label`, sin el atajo legacy uniforme (`cellType`/`unit`/
  // `availableUnits`/`options`/`maxLength` a nivel de fila, VS-024) — toda
  // fila se construye siempre celda por celda desde este slice. `cells` ya
  // no es opcional: una fila sin ninguna celda no tiene sentido (no hay
  // "modo legado" al que caer). El superRefine que exigía cellType-o-cells
  // desaparece; el que exigía expression en calculado ya vivía en
  // `formTableCell` (queda sin cambios, sigue validando por celda).
});

const tablaDatosConfig = z.object({
  columns: z.array(formTableColumn).min(1),
  rows: z.array(formTableRow).min(1),
});
```

`formTableCell` (tipo/editable/content/expression/unit/availableUnits/options/maxLength, `.superRefine()` de `calculado`→`expression`) **no cambia** — ya era la unidad de configuración correcta desde VS-047, el problema nunca fue la celda en sí sino que la grilla forzaba dos filas/columnas estructurales que no eran celdas.

### Semántica de celda en blanco — sin cambios

Sigue igual que VS-047: si `row.cells` no tiene una entrada para una `columnId` dada, esa posición está en blanco (`<td>` vacío con un "+" para agregarla) — permite grillas irregulares. Como `cells` ahora es `.min(1)` en vez de opcional, la única diferencia es que una fila siempre tiene *al menos* una celda poblada en algún lado (nunca una fila 100% vacía) — no afecta el comportamiento de blanco por columna.

### Unidad por celda — se activa el render que ya existía sin usar

VS-023 (número con unidad) originalmente vivía a nivel de fila (`row.unit`/`row.availableUnits`, con un selector en el `<th scope="row">`). VS-044 agregó `unit`/`availableUnits` **por celda** en `formTableCell`, pero el selector de unidad en Runtime/Preview seguía leyendo solo `row.availableUnits` — el campo por celda se podía configurar en el Builder y se serializaba en el CSV, pero **nunca se renderizaba un selector para una celda individual** (gap preexistente, no causado por este slice). Al eliminar `row.unit`/`row.availableUnits` (ya no hay nivel de fila), este slice **completa** ese render pendiente: el selector de unidad ahora aparece junto a cualquier celda `numero` con `availableUnits`, clave sintética `${unitKeyPrefix}::${row.id}::${col.id}` (antes `${unitKeyPrefix}::${row.id}`, un nivel más específico — necesario porque ya no hay "la unidad de la fila", cada celda numérica puede tener la suya).

### Builder (`TableConfigEditor`) — grilla verdaderamente uniforme

- **Elemento nuevo `tabla_datos`**: arranca con exactamente **una celda** — `columns: [{ id }], rows: [{ id, cells: [{ columnId, cellType: "texto", editable: true }] }]`. Sin `label` en ningún lado.
- **Render**: una sola `<table>` sin `<thead>` especial. Cada `<tr>` es una fila completa de celdas de datos — la primera fila (`rows[0]`) incluye la celda en la posición (0,0), que se edita con el mismo chip-expandible que cualquier otra celda (tipo/editable/contenido fijo/config según tipo). No existe ya `RichTextEditor` de "encabezado de columna" ni "encabezado de fila" como controles separados — si el admin quiere ese texto, lo escribe en la celda misma marcándola "solo lectura".
- **"+ columna" / "+ fila"**: dos botones fijos en los bordes de la grilla (no en una fila/columna de encabezado, que ya no existe) — "+ columna" en una celda con `rowSpan={rows.length}` al final de cada `<tr>` (visualmente una franja vertical a la derecha de toda la grilla), "+ fila" en una fila final con `colSpan={columns.length}` debajo. Mismo comportamiento que antes: agrega una columna/fila y crea una celda `texto`/`editable` en cada intersección nueva (el admin puede quitarlas puntualmente después para grillas irregulares).
- **Quitar columna/fila**: en vez de un control de borde, se resolvió como dos botones ("Quitar fila"/"Quitar columna") dentro del panel expandido de CUALQUIER celda de esa fila/columna — coherente con "toda celda es uniforme", no hace falta un control anclado a un borde específico; alcanzable desde cualquier celda de la fila/columna que se quiere quitar.
- **Celda del cuerpo** (cualquier posición, incluida la esquina): sin cambios respecto al chip-expandible de VS-047 (tipo/editable/contenido fijo/config), simplemente ya no hay ninguna celda estructuralmente excluida de este control.
- **`convertRowToCells`/modo legado**: se elimina — ya no existe una fila sin `cells`, no hay nada que convertir.
- **Tabla embebida en sub-opción** (`subOption.table`, VS-042): mismo `TableConfigEditor`, mismo default de 1 celda.

### Runtime (`FormTableView`) y Preview (`PreviewTableView`)

Se elimina el `<thead>` con `column.label` y el `<th scope="row">` con `row.label`/selector de unidad de fila. Cada celda se resuelve así (simplifica la resolución de VS-047, que tenía que hacer fallback a la fila legacy):

```ts
const cellCfg = row.cells.find((c) => c.columnId === col.id);
if (!cellCfg) return <td className="runtime-table__blank" />;
if (cellCfg.cellType === "calculado") { /* TableCalculatedCell, sin cambios */ }
if (cellCfg.editable === false) return <td><RichLabel html={cellCfg.content ?? ""} /></td>;
// input/select según cellCfg.cellType, con selector de unidad si numero+availableUnits
```

### Export CSV

`cellConfig(row, columnId)` se simplifica a `row.cells.find((c) => c.columnId === columnId)` (sin fallback a fila legacy). Como ya no hay `col.label`/`row.label`, la referencia humana en el CSV pasa a ser **posicional**: `Fila N: Columna M=valor unidad` (1-indexado sobre el orden de `rows[]`/`columns[]`) en vez de `{row.label}: {col.label}=valor`. La clave de unidad por celda pasa a `${prefix}::${row.id}::${col.id}` (antes `${prefix}::${row.id}`).

### Fuera de alcance (explícito)

- **Editor legado de subindicadores directos bajo Dimensión**: sigue sin actualizar (ya documentado como fuera de alcance en VS-047, sigue así).
- **Insertar columna/fila en una posición intermedia**: igual que VS-047, solo al final desde el borde.
- **`rowspan`/`colspan` real**: igual que VS-047, se resuelve con celdas en blanco o contenido fijo repetido.
- **Migración de tablas VS-047 ya construidas**: no aplica — confirmado con el usuario que no hay datos reales que preservar; las tablas de prueba existentes en producción se recrean o se descartan.

### Notas de implementación

- **Tests**: `form-schema.test.ts` pierde los casos de compatibilidad hacia atrás de VS-047 (`row.cellType` legacy, `column.label`/`row.label`) y gana casos para el schema nuevo (columna sin `label`, fila `cells.min(1)`, esquina como celda editable/fija/calculada como cualquier otra).
- **`formula.ts`/`evaluateTableExpression`**: sin cambios — nunca dependió de labels, solo de `rowId`/`columnId`.
- **`response.ts`/`TableValue`**: sin cambios — sigue siendo un mapa disperso `rowId -> columnId -> valor`, ajeno a si esa posición es "dato" o "encabezado".

### Estado

Implementado y verificado en producción.

### Verificación en producción (2026-08-16)

Commit `becef64` + push a `main`, deploy Vercel `dpl_37hNKdjyD3eogTStEMoD3kGPnixg` READY. Framework temporal "TEMP - VS-048 verificacion": elemento `tabla_datos` nuevo confirmó arrancar con **exactamente una celda** — chip "Texto", sin `<thead>`, sin columna de encabezado, solo "+ columna"/"+ fila" en los bordes (regresión directa de lo que VS-047 hacía mal). Construida una tabla de doble entrada real: esquina (fila 0, columna 0) marcada "solo lectura" con contenido fijo "Región / Año", columna 2 fija "2024", fila 2 fija "Norte", celda de dato tipo Número editable. Vista previa del Builder renderizó la grilla 2×2 completa sin ningún hueco estructural — la esquina mostró "Región / Año" como cualquier otra celda fija, se pudo escribir **42** en la celda de dato y persistió en el estado. Framework temporal pendiente de borrado con confirmación explícita del usuario.

## Referencias a nivel de pregunta en selección única y múltiple (VS-056, spec doc-first)

### Contexto y pedido

En el HTML de referencia de S&P (ver `docs/analysis/csa-sp-global-comparison.md`), el bloque de referencias aparece **a nivel de la pregunta**, entre el texto de la pregunta y las opciones:

```html
<p>¿El consejo de administración de la compañía...?</p>
<div id="fileref-BordChairperson" class="sims-input reference"
     data-ref-type="flexible" data-maxrefs="3"
     data-dpd-name="COG_NonExecutive_AttachmentBordChairperson">
  <!-- hasta 3 slots: URL pública o documento adjunto -->
</div>
<ol><!-- opciones del radio --></ol>
```

Hasta VS-056 las referencias solo viven **dentro de** opciones (`formOption.references`, VS-039/045) y sub-opciones (`subOption.references`, VS-040/045), o como elemento `url_publica` separado (VS-017). No existe un bloque de referencias a nivel de la pregunta misma. Este slice lo agrega para **`seleccion_unica` y `seleccion_multiple`** (alcance confirmado con el usuario), con `refType` **flexible** (URL o documento interno, como el ejemplo).

### Decisión de diseño

- **Se reutiliza el tipo `optionReferences` tal cual** (`maxUrls`, `position`, `refType`) como `references?: optionReferences` en los elementos `seleccion_unica` y `seleccion_multiple`. `position` no aplica a nivel de pregunta (no hay sub-opciones que ordenar): el bloque se renderiza SIEMPRE entre el texto de la pregunta y las opciones, y el Builder no expone el selector de posición. Mismo criterio de reuso simple ya establecido en VS-022.
- **Clave de respuesta sintética**: `${elementId}::refs` → `(string | EvidenceRef)[]`, idéntica forma al valor de referencias de opción de VS-045 (`optionReferenceValue`). **Sin cambios en `response.ts`**. No colisiona con las claves de opción (que son de 3 segmentos: `${elementId}::${optionId}::refs`).
- Defaults en Runtime igual que VS-039: `maxUrls = 3`, `refType = "public"` si vienen `undefined`.
- El bloque se renderiza con el mismo `OptionReferencesView` del Runtime (ya soporta flexible con upload vía `presign-ref` y degradación a solo-URL cuando `token` es `undefined`) y con `PreviewOptionReferences` en el preview del Builder.

### `packages/sdk-core/src/form-schema.ts`

```ts
// en `seleccion_unica` y `seleccion_multiple`:
z.object({
  ...questionBase,
  type: z.literal("seleccion_unica"), // o "seleccion_multiple"
  options: z.array(formOption).min(1),
  references: optionReferences.optional(), // VS-056
}),
```

### Builder (`apps/web/components/subindicator-editor.tsx`)

Bloque "Referencias de la pregunta" en la sección de configuración de `seleccion_unica`/`seleccion_multiple` (mismo patrón visual que el bloque de referencias de opción): botón "Agregar referencias" → campos **Máximo de URLs** (number, min 1) y **Tipo** (URL pública / Flexible), con botón de quitar. Handlers nuevos: `addElementReferences`, `removeElementReferences`, `updateElementReferencesMaxUrls`, `updateElementReferencesRefType` (sin `position`).

### Runtime (`apps/web/app/evaluations/[token]/page.tsx`)

En `ElementView` de `seleccion_unica`/`seleccion_multiple`, cuando `element.references` existe: renderizar `OptionReferencesView` entre el legend/helpText y el contenedor de opciones, con `value={answers[`${element.id}::refs`]}` y `onChange` que escribe esa clave sintética.

### Preview (`apps/web/components/form-preview.tsx`)

Mismo render en el preview del Builder: `PreviewOptionReferences` con `refType`/`maxUrls` del elemento y estado `previewAnswers[`${element.id}::refs`]`.

### Exportación (`docs/engines/export.md` — `apps/web/lib/evaluation-export.ts`)

En `formatAnswer` de `seleccion_unica`/`seleccion_multiple`, anexar a la celda Respuesta las referencias del elemento con el mismo formato de sufijo de `formatOptionReferences` (leer `answers[`${element.id}::refs`]`). Aplica a CSV y XLSX (ambos comparten `evaluation-export.ts`).

### Fuera de alcance (explícito)

- Editor legado de subindicadores directos bajo Dimensión (patrón establecido: solo el Builder de Subindicadores bajo Marco recibe UI nueva).
- Otros tipos de pregunta (texto, número, dropdown, tabla, etc.).
- `position` configurable a nivel de pregunta (siempre entre texto y opciones).
- Verificación en producción en navegador: en este slice NO hay verificación funcional (el entorno no tiene navegador).

## Celda de tabla tipo casilla con texto revelado (VS-061)

> **Actualizado en VS-065 (2026-08-18):** `revealText: boolean` (siempre un input de texto libre) fue reemplazado por `revealField?: subOptionField` — el admin ahora elige el TIPO de campo revelado (texto/número/selección), mismo tipo reutilizado en `subOption.field`/`formOption.field`. Ver "Campo elegido por el admin al marcar una celda casilla" más abajo. Esta sección queda como registro histórico de la decisión original.

### Contexto y pedido

HTML real de S&P (`COG_AlignmentLongTermPerformance_Selection`, tabla embebida en la opción "Sí" de nivel superior, mismo patrón de `formOption.table` de VS-060): la celda "Aspectos" de la fila "Periodo de rendimiento" combina contenido fijo (título en negrita + descripción) con un control **propio e independiente** del evaluado — un checkbox `Yes_No` ("La empresa cuenta con una cláusula de recuperación de recursos") que, al marcarse, revela un input de texto ("Por favor, especifica:").

No es una celda "mixta" en el sentido de contenido-fijo-más-input-en-la-misma-celda: es una pregunta de tipo casilla+texto-opcional que el HTML de S&P coloca visualmente junto al contenido fijo de la fila. Se modela como lo que es — una celda editable más, con su propio `cellType` — no como una extensión del modo `content` (que sigue siendo exclusivamente fijo/no-interactivo, sin cambios). El admin la ubica agregando una celda a esa fila (mismo mecanismo "+" ya existente desde VS-047/048 para grillas irregulares); si quiere reproducir la agrupación visual del HTML original, usa la columna existente o agrega una columna nueva — decisión de layout del admin, no un caso especial del motor.

### Decisión de diseño — nueva variante de `cellType`, no un concepto de celda mixta

Ya existen 4 decisiones de diseño en este documento que evitan combinatoria no observada (tipo por fila con override por celda, VS-024/044; `editable`/`content` binario, VS-047/048). Agregar "casilla" como quinto valor de `formTableCellType` mantiene esa misma invariante — **una celda, un tipo** — en vez de introducir una noción nueva de celda que sea simultáneamente contenido fijo Y control interactivo, que rompería esa invariante para un solo caso de uso observado.

```ts
const formTableCellType = z.enum(["texto", "numero", "seleccion_desplegable", "calculado", "casilla"]); // VS-061

const formTableCell = z.object({
  columnId: z.string().min(1),
  cellType: formTableCellType,
  expression: z.string().optional(),
  editable: z.boolean().optional(),
  content: z.string().optional(),
  unit: z.string().min(1).optional(),
  availableUnits: z.array(z.string().min(1)).min(1).optional(),
  options: z.array(formOptionBase).min(1).optional(),
  maxLength: z.number().int().positive().optional(),
  revealText: z.boolean().optional(), // VS-061 — solo aplica si cellType === "casilla"
});
```

`revealText` (default `false`/ausente = casilla simple sin texto adicional) es la única config nueva — mismo criterio de costo/beneficio que el resto de config por celda: no hay validación cruzada en zod (el Builder la exige solo como regla de UI), consistente con `options` de `seleccion_desplegable` (VS-024) y `expression` de `calculado` (VS-043, única celda con `.superRefine()` porque ahí sí hay una dependencia dura, no solo cosmética).

### Respuesta: cero cambios de forma

El valor de la celda sigue siendo `tableCellValue = string | number` (sin cambios): la casilla marcada se guarda como `"true"`, sin marcar como `""` — mismo patrón exacto que `naKey`/`markedNA` (`packages/sdk-core/src/response.ts`, `onAnswerChange(naKey(elementId), e.target.checked ? "true" : "")`), no un booleano nuevo en `tableCellValue`.

El texto revelado (cuando `revealText === true` y la celda está marcada) se guarda bajo una clave sintética en el mapa `answers` de nivel superior, **reutilizando `commentKey` sin cambios** (`packages/sdk-core/src/response.ts`), con el mismo id compuesto de 3 segmentos ya usado por `unitKey` para unidad por celda (VS-048): `commentKey(`${element.id}::${row.id}::${col.id}`)` → `"${element.id}::${row.id}::${col.id}::comment"`. Cero cambios en `response.ts`.

### Builder (`TableConfigEditor`, `apps/web/components/subindicator-editor.tsx`)

- `CELL_TYPE_LABEL` gana `casilla: "Casilla de verificación"`.
- El `<select>` "Tipo" gana la opción `<option value="casilla">Casilla de verificación</option>` — mismo `<select>` ya usado para texto/número/selección/calculado, sin un control nuevo.
- Nueva rama condicional (hermana de las de `texto`/`numero`/`seleccion_desplegable`, dentro del bloque `editable`): un solo checkbox de config, `Permitir texto adicional al marcar` (`revealText`) — no hay más config posible para este tipo, así que no hay bloque adicional cuando está desmarcado.
- El reset de campos al cambiar de tipo (`updateCell(..., { cellType: nextType, unit: undefined, availableUnits: undefined, options: undefined, maxLength: undefined, expression: undefined, ... })`) gana `revealText: undefined` en la misma línea — mismo criterio ya aplicado a los otros campos de config específica de tipo.

### Runtime (`FormTableView`, `apps/web/app/evaluations/[token]/page.tsx`) y Preview (`PreviewTableView`, `apps/web/components/form-preview.tsx`)

Nueva rama `if (cellType === "casilla")`, mismo punto donde ya viven las ramas de `seleccion_desplegable`/`numero` (antes del fallback de `texto`): `<input type="checkbox">` que lee/escribe `cell === "true"` vía `updateCell` (mismo `onChange` inmutable que el resto de la tabla); si `cellCfg.revealText` y la celda está marcada, un `<input type="text">` adicional debajo que lee/escribe `answers[commentKey(`${unitKeyPrefix}::${row.id}::${col.id}`)]` vía `onAnswerChange` — mismo patrón ya usado para el `<select>` de unidad condicional de la rama `numero` (VS-048), reemplazando `unitKey` por `commentKey`. Preview usa `previewAnswers`/`setPreviewAnswers` en vez de `answers`/`onAnswerChange`, sin otro cambio (mismo patrón que el resto de `PreviewTableView`).

### Exportación (`apps/web/lib/evaluation-export.ts`)

Las dos ramas que serializan una tabla ("fila N: columna M=valor", `formatEmbeddedTable` para tablas embebidas en opción/sub-opción y el bloque inline de `tabla_datos` suelto en `formatAnswer` — deliberadamente duplicadas desde VS-024, ver nota existente en el archivo) ganan una rama más en la resolución de `resolved`: `cellCfg.cellType === "casilla" ? "Sí" : ...` (una celda sin marcar ya no llega aquí — el filtro existente `cell === undefined || cell === ""` la descarta antes, igual que cualquier otro tipo sin responder). Si `cellCfg.revealText` y hay texto guardado bajo la clave `commentKey` compuesta, se anexa como `": ${texto}"` al final de esa columna — mismo separador conceptual (`:`) que el resto del formato, sin caracteres nuevos de sintaxis.

### Fuera de alcance (explícito)

- **Celda verdaderamente mixta** (contenido fijo Y control interactivo dentro de la misma celda `<td>`) — ver "Decisión de diseño" arriba: no hay caso observado que lo requiera una vez que "casilla" existe como celda propia; si aparece, es aditivo (un `content` que conviva con `cellType !== undefined` en la misma celda), no un rediseño de esta spec.
- **Múltiples casillas independientes en una sola celda** — una celda `casilla` es una sola pregunta booleana; si una fila necesita más de una, se modela como celdas adicionales (mismo mecanismo "+" de VS-047/048), no como un array dentro de la celda.
- **Validación de que `revealText` tenga contenido cuando la casilla está marcada** — igual criterio que el resto del motor (`persistence.md`, "Validación de reglas de contenido al guardar" fuera de alcance): se guarda lo que el evaluado escriba, vacío incluido.
- **Verificación en producción con `pnpm dev`/typecheck/tests locales** — por instrucción explícita del usuario, este slice se verifica únicamente contra el deploy de Vercel (`csa-v3-web.vercel.app`) vía navegador real, mismo criterio ya documentado para VS-060.

## Campo embebido directo en una opción de nivel superior (VS-062)

### Contexto y pedido

HTML real de S&P (`COG_DisclosureMedian_Selection`, "Ratio salarial CEO-empleado"): la opción "Sí" de un `seleccion_unica` trae, entre el bloque de referencias (`data-ref-type="private"`) y la tabla embebida (`formOption.table`, VS-060), un campo suelto — `"Moneda:"` + un `<input>` (`data-dpd-type="Text"`, marcado `readonly`/`disabled` en el HTML fuente, con el hint "no editable, calculado a partir de los datos del cuestionario"). No es una fila de la tabla ni depende de un sub-radio: cuelga directo de la opción.

Verificado en producción (Builder real, framework temporal): el editor de una opción de `seleccion_unica`/`seleccion_multiple` solo ofrece "Agregar sub-opción", "Agregar bloque secundario de sub-opciones", "Agregar tabla" y "Agregar referencias" — **no existe forma de agregar un campo suelto directo a la opción**. El campo embebido con tipo (select/texto/número) ya existe (`subOptionField`, VS-040) pero está atado exclusivamente a `subOption`, no a `formOption` — a diferencia de `references`/`table`, que VS-039/042/060 sí extendieron a ambos niveles.

### Decisión de diseño

**Reusar `subOptionField` tal cual en `formOption`, mismo patrón ya usado para `references`/`table`** — no un tipo nuevo, un campo más compartido entre `subOption` y `formOption`.

Sobre el carácter "de solo lectura/calculado" del campo real de S&P: el motor no tiene (ni construye acá) un mecanismo de cálculo cruzado entre preguntas — `engine/formula` opera sobre referencias dentro del mismo Elemento/tabla (VS-013/043), y VS-023 ya dejó "conversión entre unidades" fuera de alcance explícito por el mismo motivo. Replicar el cálculo real de S&P (moneda derivada de datos externos al cuestionario) no es viable con lo que existe. Se modela como campo **editable normal** (`texto_corto`, el evaluado escribe la moneda) — decisión confirmada con el usuario, quien prefirió esto a una variante de solo lectura para no introducir un mecanismo de contenido fijo nuevo a nivel de campo (ya existe uno a nivel de celda de tabla, VS-047, que no aplica acá porque no hay tabla involucrada).

```ts
const formOption = formOptionBase.extend({
  subOptions: z.array(subOption).optional(),
  secondaryOptionsHeading: z.string().optional(),
  secondaryOptions: z.array(subOption).optional(),
  secondaryOptionsExclusive: z.boolean().optional(),
  table: tablaDatosConfig.optional(),
  field: subOptionField.optional(), // VS-062 — mismo tipo que subOption.field (VS-040)
});
```

### Respuesta: misma clave sintética que `subOption.field`, un nivel menos

Cero cambios en `response.ts`: clave sintética `` `${elementId}::${optionId}::field` `` → `string | number` (según `field.type`) — mismo patrón ya usado por `subOption.field` (`` `${subOptionKey}::field` ``, VS-040) y por `opt.table`/`opt.references` (VS-060/039), un segmento menos de anidación.

### Builder (`subindicator-editor.tsx`)

`addOptionField`/`removeOptionField`/`updateOptionFieldMaxLength`/`updateOptionFieldNumero`/`addOptionFieldOption`/`updateOptionFieldOption`/`removeOptionFieldOption` — mismas 7 funciones que `addSubOptionField`/etc (VS-040), sin el parámetro `subOptionId`/`block`, operando un nivel más arriba (`el.options.map(opt => ...)` en vez de `opt[block].map(sub => ...)`). JSX idéntico al de `sub.field` (`<select>` "Agregar campo…" con 3 tipos, config condicional por tipo), insertado en el editor de la opción de nivel superior **antes del bloque de tabla** (mismo orden visual que el HTML de S&P: campo antes de la tabla) — la referencia sigue yendo antes según su propio `position` (VS-041), sin cambios ahí.

### Runtime (`evaluations/[token]/page.tsx`) y Preview (`form-preview.tsx`)

Reusa `SubOptionFieldView`/`PreviewSubOptionField` (VS-040) tal cual — mismo componente, ahora también invocado a nivel de opción con la clave de 2 segmentos en vez de 3. Insertado entre el bloque de referencias "before_suboptions" y el de tabla (VS-060), tanto en `seleccion_unica` como en `seleccion_multiple`.

### Exportación (`evaluation-export.ts`)

`formatOptionLabel` gana una rama que resuelve `opt.field` con la misma lógica ya usada en `formatSubOptionExtras` para `sub.field` (resuelve label si es `seleccion_desplegable`, valor literal + unidad si es `numero`/`texto_corto`), anexada a la celda de Respuesta como `" (valor)"` — antes del sufijo de tabla, mismo orden visual que el Builder/Runtime.

### Fuera de alcance (explícito)

- **Variante de solo lectura/contenido fijo para este campo** — decisión confirmada con el usuario (ver "Decisión de diseño"): se modela como campo editable normal, no como una réplica del cálculo automático de S&P.
- **`refType: "private"` en el bloque de referencias** — hallazgo secundario del mismo HTML (el selector "Tipo de referencia" del Builder solo ofrece `URL pública`/`Flexible`); no priorizado por el usuario en este slice, queda anotado para un gap futuro si se confirma que se necesita.
- **Verificación en producción con `pnpm dev`/typecheck/tests locales** — mismo criterio que VS-060/061, por instrucción explícita del usuario.

## Contenido fijo como prefijo de una celda editable (VS-063)

### Contexto y pedido

Mismo HTML real de S&P que originó VS-061 (`COG_AlignmentLongTermPerformance_Selection`, fila "Periodo de rendimiento para la remuneración variable del CEO"): la celda combina, en este orden, **dentro de un mismo `<td>`**:

1. Texto fijo (`<strong>` título + `<p>` descripción) — contenido del admin.
2. Un checkbox `Yes_No` con su propia etiqueta ("La empresa cuenta con una cláusula de recuperación de recursos. Por favor, especifica:") — la celda `casilla` de VS-061.
3. Un input de texto revelado al marcar — `revealText` de VS-061.

VS-061 explícitamente dejó esto fuera de alcance ("Celda verdaderamente mixta — contenido fijo Y control interactivo dentro de la misma celda"), con la nota de que sería aditivo si aparecía un caso real. El usuario confirmó que necesita construir exactamente esto: "colocar texto, luego el checkbox con su contenido, y adicionarle el campo" — el texto fijo hace de encabezado/etiqueta de la celda, el checkbox (con su propia etiqueta ya incluida en ese texto fijo) y el campo revelado son la parte interactiva.

### Decisión de diseño — relajar una restricción existente, no agregar campos nuevos

`formTableCell.content` (VS-047) ya existe con el shape correcto (HTML sanitizado, mismo motor que el resto de labels). La única restricción a remover es semántica, no de schema: **`content` deja de ignorarse cuando `editable !== false`** — si está presente en una celda editable, se renderiza como texto fijo (rich label) inmediatamente ANTES del control interactivo de esa celda, sea cual sea su `cellType`. Cero cambios en `packages/sdk-core/src/form-schema.ts` (el campo `content: z.string().optional()` ya estaba ahí desde VS-047) — solo cambia dónde se lee en Runtime/Preview y dónde se expone en el Builder.

La etiqueta propia del checkbox ("La empresa cuenta con... especifica:") **no es un campo nuevo** — el admin la escribe como parte del mismo `content` (junto con el título/descripción), ya que rich text ya soporta múltiples párrafos (VS-045). El checkbox en sí se renderiza sin label propia (ya la trae `content`), igual criterio que cualquier control sin `<label>` visible cuando el texto ya está cubierto por contexto inmediato anterior.

```ts
// packages/sdk-core/src/form-schema.ts — formTableCell, sin cambios de forma:
const formTableCell = z.object({
  columnId: z.string().min(1),
  cellType: formTableCellType,
  expression: z.string().optional(),
  editable: z.boolean().optional(),
  content: z.string().optional(), // VS-047, reinterpretado en VS-063: ya no exclusivo de editable === false
  unit: z.string().min(1).optional(),
  availableUnits: z.array(z.string().min(1)).min(1).optional(),
  options: z.array(formOptionBase).min(1).optional(),
  maxLength: z.number().int().positive().optional(),
  revealText: z.boolean().optional(),
});
```

**Compatible hacia atrás**: ninguna celda existente cambia de comportamiento — las celdas `editable === false` siguen mostrando solo `content` (sin control, sin cambios); las celdas `editable === true` sin `content` siguen sin mostrar nada antes del control (sin cambios). Solo la combinación nueva (`editable: true` + `content` presente) es la que antes se ignoraba y ahora se renderiza.

### Builder (`TableConfigEditor`, `apps/web/components/subindicator-editor.tsx`)

La rama `editable` (que hoy salta directo a la config específica de `cellType`) gana, como primer campo, un editor de rich text opcional **"Texto fijo antes del control"** (mismo `RichTextEditor` ya usado para el `content` de una celda `editable: false`) — visible siempre que la celda sea editable, sin un toggle adicional que complique el flujo: es un campo más, en blanco por defecto, igual costo cognitivo que "Ayuda" en una pregunta suelta. `calculado` queda sin este campo (una fórmula no necesita texto de encabezado propio — su resultado ya es autoexplicativo por la fila/columna, y agregar el campo ahí sería ruido sin caso de uso).

### Runtime (`FormTableView`, `apps/web/app/evaluations/[token]/page.tsx`) y Preview (`PreviewTableView`, `apps/web/components/form-preview.tsx`)

Las 4 ramas que ya renderizan un control editable (`seleccion_desplegable`, `numero`, `casilla` [VS-061], y el fallback `texto`) ganan, como primer hijo del `<td>`, `{content && <RichLabel html={content} />}` antes del control — mismo componente `RichLabel` ya usado para el modo `editable === false`. La rama `calculado` (siempre de solo lectura, se evalúa antes del chequeo de `editable`) queda sin cambios — no hay caso de uso observado ahí.

### Exportación (`evaluation-export.ts`)

**Sin cambios** — `content` es puramente de presentación (la etiqueta que ve el evaluado), nunca formó parte de la resolución de la celda Respuesta ni siquiera en su uso original (VS-047, celda `editable: false`); las 2 ramas que serializan tablas siguen resolviendo únicamente el valor de la celda (`cell`), no su `content`.

### Fuera de alcance (explícito)

- **`content` en celdas `calculado`** — sin caso de uso observado, ver "Runtime" arriba; aditivo si aparece.
- **Múltiples controles interactivos en una misma celda** (ej. dos checkboxes independientes) — sigue habiendo un solo control por celda; si una fila necesita más de un control mixto-con-texto, se modela como celdas adicionales (mismo mecanismo "+" ya usado en VS-047/048/061), cada una con su propio `content` de encabezado si corresponde.
- **Verificación en producción con `pnpm dev`/typecheck/tests locales** — mismo criterio que VS-060/061/062, por instrucción explícita del usuario.

## Etiqueta propia de una celda casilla (VS-064)

### Contexto y pedido

VS-063 resolvió el caso mixto bakeando la etiqueta propia del checkbox (`"La empresa cuenta con una cláusula de recuperación de recursos. Por favor, especifica:"`) dentro de `content` (texto fijo compartido con el título/descripción de la celda) — el checkbox quedaba sin ninguna etiqueta propia (`<input type="checkbox">` desnudo). El usuario pidió corregirlo: **la casilla debe tener su propio texto tal cual el HTML compartido**, tanto porque el evaluado necesita entender qué está marcando (motivo funcional/de accesibilidad — un checkbox sin nombre accesible es una violación WCAG real, ver VS-015) como porque visualmente se ve mejor (el texto envuelto en un `<label>` junto al control, no una oración suelta arriba de un checkbox flotante).

### Decisión de diseño

Nuevo campo `checkboxLabel?: string` en `formTableCell`, **distinto de `content`**: `content` sigue siendo el texto fijo de la celda (título/descripción, ANTES del control — VS-063, aplica a cualquier `cellType`); `checkboxLabel` es específico de `cellType === "casilla"` y es el texto que el evaluado lee junto al checkbox, dentro de un `<label>` real (mismo patrón ya usado en el resto del motor — N/A, sub-opciones — `<label className="field field--checkbox"><input type="checkbox"/>{texto}</label>`). Si `checkboxLabel` está ausente, el checkbox cae a un `<span className="sr-only">Marcar</span>` (nombre accesible mínimo, no rompe accesibilidad aunque el admin no lo complete).

```ts
const formTableCell = z.object({
  // ...campos existentes sin cambios...
  revealText: z.boolean().optional(), // VS-061
  checkboxLabel: z.string().optional(), // VS-064 — solo aplica si cellType === "casilla"
});
```

Con esto, el caso real de S&P se modela como: `content` = `"<p><strong>Periodo de rendimiento para la remuneración variable del CEO</strong></p><p>Por favor, indique el periodo de desempeño más largo cubierto por el plan de compensación ejecutiva:</p>"` (título+descripción, fijo) y `checkboxLabel` = `"La empresa cuenta con una cláusula de recuperación de recursos. Por favor, especifica:"` (la etiqueta del checkbox) — exactamente la separación que tiene el HTML original entre el `<div class="level">` de arriba y el `<p>` que acompaña al `<input type="checkbox">`.

### Builder (`TableConfigEditor`, `apps/web/components/subindicator-editor.tsx`)

La rama `cell.cellType === "casilla"` gana un `RichTextEditor` nuevo, "Etiqueta de la casilla", ANTES del checkbox "Permitir texto adicional al marcar" — mismo componente ya usado para "Texto fijo antes del control", sin ambigüedad de cuál es cuál porque están en secciones separadas con label propia. El reset de campos al cambiar `cellType` gana `checkboxLabel: undefined`.

### Runtime (`FormTableView`) y Preview (`PreviewTableView`)

El checkbox pasa de `<input type="checkbox">` suelto a `<label className="field field--checkbox"><input type="checkbox" .../>{RichLabel de checkboxLabel, o "Marcar" sr-only}</label>` — mismo patrón que el checkbox de N/A (`persistence.md`) y de sub-opciones (VS-016). El input de texto revelado (`revealText`) sigue como hermano de ese `<label>`, sin cambios de posición.

### Exportación

**Sin cambios** — `checkboxLabel` es puramente de presentación, igual criterio que `content` (VS-063).

### Fuera de alcance (explícito)

- **Verificación en producción con `pnpm dev`/typecheck/tests locales** — mismo criterio que el resto de este documento, por instrucción explícita del usuario.

## Campo elegido por el admin al marcar una celda casilla (VS-065)

### Contexto y pedido

Dos pedidos del usuario sobre lo ya construido en VS-061/063/064:

1. **Bug visual real**: el checkbox de una celda `casilla` se veía "muy separado" de su texto, desordenado. Causa raíz: `.runtime-table input, .runtime-table select { width: 100%; }` (VS-024) pisaba a la regla global `input[type="checkbox"] { width: 16px; }` — mismo nivel de especificidad (selector de clase + tipo vs. atributo + tipo), gana la que aparece después en la hoja (`.runtime-table`, más abajo en `globals.css`). El checkbox se estiraba al ancho completo de la columna, empujando su texto lejos a la derecha.
2. **`revealText: boolean` es demasiado rígido**: VS-061 solo permitía revelar un input de texto libre. El usuario pidió que el admin elija el TIPO de campo (texto/número/selección) — "así como en las otras partes donde se agrega campos, reutiliza esos componentes" — es decir, el mismo mecanismo ya construido para `subOption.field` (VS-040) y `formOption.field` (VS-062), no uno nuevo.

### Fix de CSS

`apps/web/app/globals.css`: nueva regla `.runtime-table input[type="checkbox"] { width: 16px; min-width: 0; }` (misma especificidad que `.runtime-table input`, pero MÁS ABAJO en la hoja → gana) y `.runtime-table .field--checkbox { align-items: flex-start; }` (alineación arriba, no centrada — una etiqueta de casilla puede ser rich text de varios párrafos, centrar verticalmente se vería raro con texto largo). `.field--checkbox` en sí (`flex-direction: row; align-items: center; gap: var(--space-2)`, definida para el resto del motor — N/A, sub-opciones) no cambia.

### Decisión de diseño — reemplazo, no adición

`revealText: boolean` (VS-061) se reemplaza por `revealField?: subOptionField` — **mismo tipo `subOptionField` ya definido y reutilizado por `subOption.field`/`formOption.field`**, sin tipo nuevo. Reemplazo limpio (no aditivo/deprecado): el campo se lanzó el mismo día en esta sesión, sin datos reales dependiendo de él (los únicos usos fueron frameworks de QA ya borrados) — no hay costo de migración.

```ts
const formTableCell = z.object({
  // ...campos existentes sin cambios (columnId, cellType, editable, content, checkboxLabel, etc.)...
  revealField: subOptionField.optional(), // VS-065 — reemplaza revealText: boolean (VS-061). Solo aplica si cellType === "casilla".
});
```

### Respuesta: misma convención de clave que `subOption.field`/`formOption.field`

Cambia el sufijo de la clave sintética: antes `commentKey(...)` → `::comment` (VS-061, prestado del patrón de comentario confidencial, semánticamente incorrecto para este caso). Ahora `` `${prefix}::field` `` — idéntico sufijo que `subOption.field` (`` `${subOptionKey}::field` ``) y `formOption.field` (`` `${elementId}::${optionId}::field` ``), construido inline igual que esos dos (sin una función helper `fieldKey`, seguimos el mismo patrón: la clave se arma en el punto de uso). Valor: `string | number` según `revealField.type`, ya cubierto por `AnswerValue` sin cambios (mismo criterio que el resto del motor).

### Builder (`TableConfigEditor`, `apps/web/components/subindicator-editor.tsx`)

Nuevo alias local `CellRevealField = NonNullable<TableConfigCell["revealField"]>` (mismo tipo que `SubOptionField`, redeclarado porque `TableConfigEditor` es un componente hermano de `SubindicatorEditor`, sin acceso a sus alias internos — mismo criterio ya usado para `TableConfigCell` en este archivo). El checkbox "Permitir texto adicional al marcar" (VS-061) se reemplaza por el mismo patrón `<select>` "Agregar campo…" ya usado en `sub.field`/`opt.field`: sin campo → `<option value="">Agregar campo al marcar…</option>` + 3 tipos; con campo → chip "Campo: <tipo>" + "Quitar campo" + config condicional por tipo (longitud máxima / mín-máx-unidad / CRUD de opciones), idéntica a la de `sub.field`/`opt.field` pero implementada sobre el `updateCell(rowId, columnId, patch)` genérico ya existente en `TableConfigEditor` (más simple que `sub.field`, que necesitó su propio `updateSubOptionNode` por la anidación extra).

### Runtime (`FormTableView`) y Preview (`PreviewTableView`)

Reemplaza el `<input type="text" placeholder="Especifique">` fijo por el mismo `SubOptionFieldView`/`PreviewSubOptionField` ya usado para `sub.field`/`opt.field` — mismo componente, misma clave sintética `${prefix}::field`.

### Exportación (`evaluation-export.ts`)

Nueva función compartida `resolveRevealField(cellCfg, prefix, answers)` (reemplaza la resolución inline de VS-061 en las 2 ramas que serializan tablas) — misma lógica de resolución que `formatSubOptionExtras` para `sub.field` (label si `seleccion_desplegable`, valor + unidad si `numero`/`texto_corto`), evitando duplicar esa lógica una tercera vez.

### Fuera de alcance (explícito)

- **Migración de datos de `revealText`/`::comment` a `revealField`/`::field`** — sin datos reales, ver "Decisión de diseño".
- **Verificación en producción con `pnpm dev`/typecheck/tests locales** — mismo criterio que el resto de este documento, por instrucción explícita del usuario.

## Combinar columnas — colspan (VS-066)

### Contexto y pedido

Mismo HTML real de S&P (`COG_DisclosureMedian_Selection`, tabla de compensación CEO-empleados) que originó VS-062: la tabla embebida es un grid de 3 columnas donde algunas celdas explícitamente combinan las 2 últimas (`<th colspan="2">Compensación total de los CEOs</th>`, y su fila de dato correspondiente `<td colspan="2">` con el input de compensación del CEO). Sin esto, el admin podía crear la tabla pero no replicarla fielmente — el motor no tenía forma de decir "esta celda ocupa 2 columnas", forzando o una columna de más sin uso real, o perder la fila de encabezado combinado.

Segundo pedido, ortogonal: en el editor de grilla (`TableConfigEditor`), una celda colapsada solo mostraba su tipo genérico ("Fijo", "Texto"...) — el admin tenía que expandir cada celda para recordar qué contenido puso, incluso en tablas de varias filas/columnas donde eso se vuelve tedioso. Pidió ver un extracto del contenido real directamente en el chip colapsado.

### Decisión de diseño — colSpan por celda, mismo criterio "grillas irregulares" de VS-048

`formTableCell` gana `colSpan?: number` (entero, mínimo 2 — ausente = 1, sin combinar). Una celda con `colSpan: N` combina, a partir de su propia columna (`columnId`), las siguientes `N-1` columnas. **Las columnas cubiertas por ese combinado NO llevan celda propia en esa fila** — mismo criterio que ya existía para "grillas irregulares" (VS-048: sin entrada en `cells[]` = celda en blanco/cubierta), no un concepto nuevo. Esto evita datos huérfanos: una celda escondida detrás de un colspan nunca se renderiza ni se puede editar, así que no tiene sentido que exista.

```ts
const formTableCell = z.object({
  // ...campos existentes sin cambios...
  colSpan: z.number().int().min(2).optional(), // VS-066 — ausente = 1 (sin combinar)
});
```

**Sin `rowSpan`**: el HTML real inspeccionado solo usa `colspan`, nunca `rowspan` — mismo criterio de "no diseñar para hipotéticos" (`CLAUDE.md`) ya aplicado repetidamente en este documento (ej. sub-opciones de un solo nivel en VS-016, tipo de celda por fila en VS-024). Aditivo si aparece un caso real.

### Renderizado: columnas cubiertas se saltan, no solo el atajo del `<td colSpan>`

En las 3 superficies que dibujan la grilla como `<table>` real (Builder `TableConfigEditor`, Runtime `FormTableView`, Preview `PreviewTableView`) hace falta más que agregar el atributo HTML `colSpan` a la celda combinada — si las columnas cubiertas siguen intentando renderizar su propio `<td>` (aunque esté vacío/en blanco), la fila termina con más `<td>`s que columnas visuales, rompiendo la grilla. Cada una de las 3 superficies precomputa, **por fila**, un `Set` de `columnId`s cubiertos (recorriendo `row.cells` buscando entradas con `colSpan >= 2` y marcando las columnas siguientes según su posición en `columns[]`), y salta esas columnas al iterar (`if (coveredColumnIds.has(col.id)) return null;`) — precomputado antes del `.map()` de columnas en vez de un contador mutable durante la iteración, para no depender de mutación dentro de un `.map()`.

La celda ancla sí recibe `colSpan={cellCfg.colSpan}` en su `<td>` real — en las 6 ramas de render por `cellType` de cada superficie (calculado, contenido fijo, selección, número, casilla, texto).

### Exportación (`evaluation-export.ts`)

**Sin cambios** — las columnas cubiertas por un colspan ya no tienen entrada en `cells[]` (por diseño, ver arriba), así que `cellConfig(row, columnId)` ya devuelve `undefined` para ellas y el filtro existente (`if (!cellCfg) return null`) ya las salta — mismo camino que cualquier celda en blanco de una grilla irregular, sin rama nueva. La numeración `Columna N` en el CSV queda con huecos donde había una columna cubierta (ej. "Columna 1=X, Columna 3=Y" si la columna 2 estaba combinada dentro de la 1) — mismo comportamiento ya aceptado para grillas irregulares en general.

### Builder (`TableConfigEditor`)

Nuevo campo "Combinar con columnas siguientes" (`<input type="number">`, min 1, max = columnas restantes a la derecha de esa celda) en la config de cada celda, oculto si la celda ya es la última columna (nada que combinar). Función `updateCellColSpan(rowId, columnId, colSpan)`: clampea el valor a las columnas realmente disponibles y, en el mismo cambio, **elimina** cualquier entrada de celda que exista en las columnas recién cubiertas (evita datos huérfanos, ver "Decisión de diseño"). Reducir el colspan de vuelta a 1 no restaura celdas previamente cubiertas — quedan en blanco, el admin las agrega de nuevo con el mismo "+" ya existente si las necesita (mismo criterio de simplicidad que el resto de la grilla).

### Vista previa de contenido en el chip de celda (mismo slice, VS-066)

Nueva función `cellPreviewText(cell)`: extrae un extracto de texto plano (máx. 40 caracteres + "…") del primer campo con contenido real — `content` (celdas fijas o con texto-prefijo, VS-063), si no `checkboxLabel` (celdas `casilla`, VS-064), si no `expression` (celdas `calculado`). El chip colapsado pasa de mostrar solo el tipo a mostrar tipo + extracto (ej. "Fijo — Compensación del CEO"), con el texto completo como `title` (tooltip nativo) para celdas truncadas. Sin cambios de comportamiento en la config expandida — es puramente una mejora de legibilidad de la grilla colapsada.

### Fuera de alcance (explícito)

- **`rowSpan`** — sin caso de uso observado, ver "Decisión de diseño" arriba.
- **Restaurar automáticamente celdas cubiertas al reducir el colspan** — quedan en blanco, se re-agregan a mano con el "+" existente.
- **Preview de contenido para celdas editables sin `content`/`checkboxLabel`/`expression`** (ej. una celda `numero` simple sin texto-prefijo) — el chip sigue mostrando solo el tipo, no hay texto real que extraer.
- **Verificación en producción con `pnpm dev`/typecheck/tests locales** — mismo criterio que el resto de este documento, por instrucción explícita del usuario.

## Adjuntar archivos o enlaces por celda (VS-067)

### Contexto y pedido

HTML real de S&P (`COG_ManagementOwnership_Selection`, tabla de propiedad accionaria de directivos): la columna "Pruebas que lo respaldan" es un campo de referencias por celda (`class="sims-input reference"`, `data-ref-type="private"`, `data-maxrefs="3"`) — el evaluado adjunta hasta 3 archivos o enlaces que sustentan el dato de esa fila. La columna vecina "Reportaje público" es una celda `casilla` (Yes/No) ya soportada desde VS-061 — sin gap ahí. Pedido explícito del usuario: "que las celdas de las tablas también permitan subir archivos adjunto o enlaces como ya lo hacemos en otras partes" — la dualidad URL-pública-o-documento-interno que el motor ya resuelve a nivel de Elemento/opción/sub-opción/pregunta (`optionReferences`, VS-039/045/056), pero nunca a nivel de celda.

### Decisión de diseño — reutilizar `optionReferences` tal cual, no un tipo nuevo

`formTableCellType` gana `"referencia"`. `formTableCell` gana `references?: optionReferences` (el mismo tipo ya usado por `formOption.references`/`subOption.references`/`element.references`), activo solo si `cellType === "referencia"` — mismo criterio de "un campo por cellType, sin discriminated union anidada" ya establecido para `unit`/`options`/`maxLength`/`checkboxLabel`/`revealField`. `optionReferences.position` (`before_suboptions`/`after_suboptions`) no tiene sentido dentro de una celda (no hay sub-opciones que posicionar) pero se deja sin tocar el tipo compartido — un campo no usado en este contexto no rompe nada, zod ya lo tolera como opcional.

```ts
const formTableCellType = z.enum([
  "texto", "numero", "seleccion_desplegable", "calculado", "casilla",
  "referencia", // VS-067
]);

const formTableCell = z.object({
  // ...campos existentes sin cambios...
  references: optionReferences.optional(), // VS-067 — solo si cellType === "referencia"
});
```

**`refType: "private"` sigue sin implementar** (mismo hallazgo ya registrado en VS-062/BACKLOG.md: el HTML real usa un tercer `refType` que el motor no modela). El pedido del usuario es la capacidad general de adjuntar archivos o enlaces, que `"flexible"` ya cubre (URL pública O documento interno subido a R2) — no pidió explícitamente el matiz "privado" (visibilidad restringida al equipo interno de S&P, sin construcción de permisos equivalente en esta plataforma) y no está priorizado. La celda `referencia` de este slice admite `refType: "public" | "flexible"`, igual que el resto del motor.

### Runtime (`FormTableView`) y Preview (`PreviewTableView`)

La celda `referencia` no guarda un valor propio en `TableValue` (a diferencia de `texto`/`numero`/`casilla`) — reutiliza el mismo `OptionReferencesView`/`PreviewOptionReferences` que ya renderizan `element.references`/`opt.references`/`sub.references`, bajo la clave sintética `${unitKeyPrefix}::${row.id}::${col.id}::refs` (mismo sufijo `::refs` que usa `formOption.references`, análogo a `::field` de `revealField`/VS-065). `content` (si el admin lo definió) se renderiza antes del control, mismo patrón "texto fijo como prefijo" de VS-063.

`FormTableView` no tenía forma de propagar `token`/`subindicatorId`/`elementId` (necesarios para subir un documento interno vía `presign-ref`) porque ninguna celda los había necesitado hasta ahora — el componente gana esos 3 props nuevos, y los 4 call sites (`tabla_datos` suelto, `subOption.table`, `formOption.table` ×2) los propagan desde el mismo scope donde ya viven (igual que `SubOptionsView` ya hace para sus propias referencias). `elementId` es siempre el id del Elemento dueño de la tabla (el `tabla_datos`, o el `seleccion_unica`/`seleccion_multiple` padre si la tabla está embebida) — no un id por celda, mismo criterio que usan las referencias de sub-opción hoy (`presign-ref` solo valida contra los Elementos de nivel superior).

`PreviewTableView` reutiliza `PreviewOptionReferences` sin pasar token — el editor no tiene R2 ni sesión de evaluación real, un slot de documento interno queda de solo lectura (mismo criterio ya establecido para `evidencia`/`opt.references` en el editor).

### Builder (`TableConfigEditor`)

Nueva opción "Referencia (archivo o enlace)" en el `<select>` de tipo de celda. Config de la celda (visible cuando `editable !== false`, igual que el resto de tipos): "Máximo de referencias" (`maxUrls`, número) + "Tipo de referencia" (`<select>` "URL pública" / "Flexible (URL o documento interno)") — mismo par de campos ya usado a nivel de Elemento/opción (`updateElementReferencesMaxUrls`/`RefType`), sin un flujo "Agregar campo…" (a diferencia de `revealField`, que es opcional dentro de una casilla, acá `references` ES la config completa del tipo de celda, se muestra siempre que `cellType === "referencia"`). Cambiar el `cellType` de una celda limpia `references` igual que limpia `checkboxLabel`/`revealField`/etc.

### Exportación (`evaluation-export.ts`)

Nueva función compartida `formatReferenceSlots(refsKey, answers)` — extraída de `formatOptionReferences` (que ahora la envuelve con el sufijo `" (Referencias: ...)"` para su uso existente sin cambio de comportamiento). En `formatEmbeddedTable` y el bloque de `tabla_datos` suelto, una celda `cellType === "referencia"` se resuelve ANTES del check `if (cell === undefined) return null` — a diferencia de toda otra celda, `referencia` nunca tiene valor en `rowValue[col.id]` (su dato vive enteramente bajo `::refs`), así que ese check la saltaría siempre si no se maneja aparte. Formato: `Columna N=url1; [Archivo: nombre.pdf]` (mismo formato de `parts` que `formatOptionReferences`, sin el envoltorio `" (Referencias: ...)"` que es específico de un sufijo de label de opción).

### Fuera de alcance (explícito)

- **`refType: "private"`** — ver "Decisión de diseño" arriba; hallazgo pre-existente (VS-062), sin priorizar por el usuario.
- **Límite de tamaño/tipo de archivo específico por celda** — usa el mismo cap de 10 MB de `presign-ref` (compartido con todas las referencias flexibles del motor), no uno configurable por celda.
- **Referencias en celdas de solo lectura (`editable === false`)** — mismo criterio que cualquier otro `cellType`: una celda fija muestra `content`, no un control interactivo.
- **Verificación en producción con `pnpm dev`/typecheck/tests locales** — mismo criterio que el resto de este documento, por instrucción explícita del usuario.

## Exclusividad y encabezado del bloque primario de sub-opciones (VS-068)

### Contexto y pedido

HTML real de S&P (`COG_ESGGovernanceOversight_Selection`): la opción "Applicable" trae DOS bloques de sub-opciones tipo checkbox, cada uno con su propio encabezado ("Supervisión de la Junta" / "Supervisión ejecutiva") — y cada ITEM checkbox dentro de esos bloques (ej. "Existe la responsabilidad a nivel de consejo...") revela, al marcarse, su PROPIO grupo de radios (ej. "Un comité dedicado a ESG/sostenibilidad" / "Otro comité a nivel de consejo"). Pedido explícito del usuario: poder construir este tipo de pregunta, hoy imposible — "el bloque de sub opción no permite agregar sub sub opción... esto además no permitiría agregar los demás labels".

Analizando el HTML contra el motor existente, el gap real NO es un 3er nivel de anidación genérico (el motor ya soporta `subOption.subOptions: subSubOption[]` desde VS-026) — son 2 piezas puntuales que faltaban:

1. **El bloque PRIMARIO de sub-opciones (`formOption.subOptions`) no tenía encabezado propio** — solo el bloque secundario (`secondaryOptionsHeading`, VS-046) lo tenía. Con 2 bloques con encabezado propio necesarios ("Supervisión de la Junta"/"Supervisión ejecutiva") y solo 2 bloques disponibles en total (`subOptions` + `secondaryOptions`, tope fijo de VS-046), faltaba dónde guardar el encabezado del primero.
2. **Una sub-opción no podía marcar sus PROPIAS sub-opciones (nivel 2) como excluyentes (radio)** — `subOption` no tenía un campo `subOptionsExclusive` propio (existía `formOptionBase.subOptionsExclusive` para el nivel 1, y `secondaryOptionsExclusive` para el bloque secundario, pero nada para "las subOptions de ESTA subOption"). Runtime/Preview lo tenían hardcodeado a `false` (checkbox) en la llamada recursiva de nivel 2 — documentado como decisión consciente en VS-026 ("sin evidencia de necesitar excluyencia ahí"), ahora con evidencia real.

Adicionalmente, el Builder nunca exponía UI de sub-sub-opciones (lista + "Agregar sub-sub-opción") dentro del bloque SECUNDARIO — solo existía para el bloque primario — pese a que la función `addSubSubOption`/`updateSubSubOption`/`removeSubSubOption` ya aceptaban el parámetro `block` desde VS-046 (nunca se llegó a usar ahí).

### Decisión de diseño

Dos campos nuevos, mismo criterio de "aditivo, no rediseño" ya aplicado en VS-026/046:

```ts
const subOption = z.object({
  id: z.string().min(1),
  label: z.string(),
  subOptions: z.array(subSubOption).optional(),
  subOptionsExclusive: z.boolean().optional(), // VS-068 — radio si true, checkbox si ausente/false
  references: optionReferences.optional(),
  field: subOptionField.optional(),
  table: tablaDatosConfig.optional(),
});

const formOption = formOptionBase.extend({
  subOptions: z.array(subOption).optional(),
  subOptionsHeading: z.string().optional(), // VS-068 — encabezado del bloque primario
  secondaryOptionsHeading: z.string().optional(),
  secondaryOptions: z.array(subOption).optional(),
  secondaryOptionsExclusive: z.boolean().optional(),
  // ...
});
```

Sin tercer nivel de anidación nuevo (`subSubOption` sigue siendo `{id, label}`, sin su propio `subOptions`) — el HTML analizado no lo necesita: los ítems revelados en el nivel 2 (ej. "Un comité dedicado...") son hojas puras, sin reveal propio. Aditivo si aparece un caso real con 3 niveles, mismo criterio ya documentado en VS-026.

### Runtime (`SubOptionsView`) y Preview (`PreviewSubOptions`)

- Los 2 call sites del bloque PRIMARIO (`seleccion_unica`/`seleccion_multiple`, Runtime y Preview) ahora pasan `heading={opt.subOptionsHeading}` — mismo prop `heading` que ya usaba el bloque secundario, sin cambios en el componente.
- La llamada recursiva de nivel 2 (dentro de `SubOptionsView`/`PreviewSubOptions`, para `sub.subOptions`) ahora pasa `exclusive={sub.subOptionsExclusive ?? false}` en vez de dejarlo en el default `false` siempre.
- Preview no necesitó cambios de tipos — `PreviewSubOptions.subOptions` ya deriva su tipo directamente del schema (`z.infer`, sin duplicar a mano), así que `subOptionsExclusive` llegó gratis al agregarlo al schema. Runtime sí duplica el tipo a mano (mismo patrón ya usado por `checkboxLabel`/`revealField` en `formTableCell`) — se agregó `subOptionsExclusive?: boolean` al tipo inline de `SubOptionsView`.

### Builder (`SubindicatorEditor`)

- Nuevo campo "Encabezado del bloque de sub-opciones (opcional)" en el bloque PRIMARIO, mismo `RichTextEditor` que ya usaba el bloque secundario — visible junto con el toggle "Sub-opciones excluyentes" en cuanto el bloque tiene al menos 1 sub-opción.
- Nuevo toggle "Sub-sub-opciones excluyentes (solo una a la vez)" por CADA sub-opción (antes de su propia lista de sub-sub-opciones) — tanto en el bloque primario como en el secundario, vía el nuevo `toggleSubOptionOwnExclusive` (reusa `updateSubOptionNode`, mismo criterio que el resto de mutaciones a nivel de sub-opción).
- El bloque secundario gana la lista de sub-sub-opciones + botón "Agregar sub-sub-opción" que le faltaba — copia exacta del bloque primario, con `block="secondaryOptions"` en cada llamada (`addSubSubOption`/`updateSubSubOption`/`removeSubSubOption`, que ya aceptaban ese parámetro desde VS-046 sin que ningún call site lo usara).

### Exportación (`evaluation-export.ts`)

**Hallazgo adicional durante la implementación**: `formatSubOptionExtras` (resuelve field/references/table de una sub-opción marcada) nunca resolvía `sub.subOptions` (nivel 2) — el CSV mostraba la sub-opción de nivel 1 marcada pero omitía por completo cuál sub-sub-opción se había elegido, sin relación con si el campo tenía o no encabezado/exclusividad propia (el gap existía desde que `subSubOption` se introdujo en VS-026, nunca ejercitado hasta ahora). Fix: `formatSubOptionExtras` ahora también llama a `formatMarkedSubOptions(sub.subOptions, subOptionKey, answers)` (la misma función ya usada para resolver el nivel 1, genérica sobre radio/checkbox) y agrega `Sub-opciones: ...` a las partes, bajo la MISMA clave sintética que usa la recursión de Runtime (`${subKey}::${sub.id}`).

### Fuera de alcance (explícito)

- **Tercer nivel de anidación genérico** (`subSubOption` con su propio `subOptions`) — sin caso observado, aditivo si aparece (mismo criterio VS-026).
- **`subOptionsHeading` a nivel de sub-opción** (para un eventual "nivel 2 con su propio encabezado") — el HTML analizado no lo necesita, los ítems revelados en nivel 2 no llevan encabezado de grupo.
- **Verificación en producción con `pnpm dev`/typecheck/tests locales** — mismo criterio que el resto de este documento, por instrucción explícita del usuario.

## Referencias y campos adicionales por celda (VS-069)

### Contexto y pedido

HTML real de S&P (`MAT_MaterialIssues_Selection`, tabla de temas materiales): la opción "Applicable" trae una tabla de 4 columnas donde las 3 columnas "Material N" combinan, EN LA MISMA CELDA:

1. Un bloque de referencias (`data-ref-type="public"`, máx. 3) — archivo/enlace de respaldo.
2. Un campo de texto libre (nombre del tema material), SIEMPRE visible, sin checkbox que lo condicione.
3. Un `<select>` (categoría del tema) — el control PRINCIPAL de la celda.

Y en otra fila de la misma tabla, una celda `casilla` revela, al marcarse, DOS campos juntos (un comentario de texto + un `<select>` "Tipo de impacto"), no solo uno. Pedido explícito del usuario: poder construir tablas así, "recordando usar los principios de UX".

Analizando contra el motor existente, 2 gaps puntuales (no un rediseño):

1. **`references` solo se podía usar si `cellType === "referencia"`** — no había forma de adjuntar referencias a una celda `seleccion_desplegable` que ADEMÁS tiene su propio control principal.
2. **`revealField` era un único campo**, y solo aplicaba a `casilla` (revelado tras marcar) — no soportaba múltiples campos juntos, ni campos "siempre visibles" en otros tipos de celda.

### Decisión de diseño

**`references` deja de ser exclusivo de `cellType === "referencia"`** — sin cambio de schema (el campo ya existía), solo de la CONDICIÓN de render: Runtime/Preview/Builder lo muestran siempre que `cellCfg.references` esté presente, sin importar el `cellType`. Para `cellType === "referencia"` sigue siendo el único contenido de la celda (sin control principal), comportamiento sin cambios; para cualquier otra celda editable, se adjunta como sufijo/complemento del control principal.

**`revealField: subOptionField` → `extraFields: subOptionField[]`** (reemplazo limpio, mismo criterio ya aplicado en VS-065 — revealText→revealField — sin datos reales confirmados dependiendo del campo anterior):

```ts
const subOptionField = z.discriminatedUnion("type", [
  z.object({ type: z.literal("seleccion_desplegable"), label: z.string().optional(), options: z.array(subOptionFieldOption).min(1) }),
  z.object({ type: z.literal("texto_corto"), label: z.string().optional(), maxLength: z.number().int().positive().optional() }),
  z.object({ type: z.literal("numero"), label: z.string().optional(), min: z.number().optional(), max: z.number().optional(), unit: z.string().min(1).optional() }),
]);

const formTableCell = z.object({
  // ...campos existentes sin cambios...
  extraFields: z.array(subOptionField).min(1).optional(), // VS-069 — reemplaza revealField
});
```

`subOptionField` (los 3 miembros del discriminated union, reusado también por `subOption.field`/`formOption.field`) gana `label?: string` — necesario para distinguir cada campo cuando una celda muestra varios juntos (ej. "Tipo de impacto:" etiquetando el `<select>` revelado). Campo opcional, no afecta los usos existentes.

Comportamiento de `extraFields` según `cellType`:

- **`casilla`**: los campos se revelan tras marcar el checkbox — mismo gating que el `revealField` singular anterior, ahora con N campos en secuencia.
- **Cualquier otro tipo editable** (`texto`/`numero`/`seleccion_desplegable`): los campos se muestran SIEMPRE, como "campos compañeros" junto al control principal — caso real: el `<select>` de categoría (control principal) con el campo de texto libre (nombre del tema) mostrado siempre junto a él.
- **`referencia`**: sin `extraFields` — esa celda ya no tiene control principal propio, no hay caso real que lo necesite.

**Sin tercer campo nuevo para el "companion field unconditional"** — se reutiliza el MISMO `extraFields`, con el gating decidido por Runtime/Preview según `cellType`, no un campo de schema separado. Evita duplicar el concepto.

### Orden de renderizado por celda (Runtime/Preview, todas las superficies)

`references` (si está configurado) → `extraFields` (si `cellType !== "casilla"`, siempre visibles) → `content` (texto fijo prefijo) → control principal → `extraFields` (si `cellType === "casilla"` y está marcada, gated).

Esto replica exactamente el orden del HTML real: referencia adjunta, campo de texto libre, etiqueta "Por favor seleccione…" (`content`), `<select>`.

### Runtime (`FormTableView`) y Preview (`PreviewTableView`)

Nuevos componentes `ExtraFieldsView`/`PreviewExtraFields` (reemplazan el render singular de `revealField`) — mapean el array `extraFields`, cada uno bajo su propia clave sintética `${unitKeyPrefix}::${row.id}::${col.id}::field::${index}` (extiende el sufijo `::field` ya usado por el `revealField` singular con un índice), mostrando `field.label` como etiqueta si está presente. `references` se calcula una sola vez por celda (`referencesBlock`) y se reutiliza en las 4 ramas de `cellType` que lo necesitan (`seleccion_desplegable`/`numero`/`casilla`/texto por defecto), evitando duplicar la llamada a `OptionReferencesView`/`PreviewOptionReferences` cuatro veces.

### Builder (`TableConfigEditor`)

- Nueva sección "Referencias" disponible para CUALQUIER celda editable (antes solo para `cellType === "referencia"`) — mismo par `maxUrls`/`refType`, con botón "Agregar referencias"/"Quitar referencias" cuando es opcional (para `cellType === "referencia"` sigue siendo la config completa, sin botón "Agregar…", comportamiento sin cambios).
- Nueva función compartida `renderExtraFields(row, col, cell, heading)` — un único bloque de lista (agregar/quitar campo, cada uno con su tipo + etiqueta opcional + config específica) reusado desde 2 lugares: celda `casilla` (encabezado "Campos revelados al marcar") y cualquier otro tipo editable excepto `referencia` (encabezado "Campos adicionales (siempre visibles)").
- Cambiar el `cellType` de una celda sigue reseteando `extraFields` (su significado cambia según el tipo — revelado vs. siempre visible — conservarlo sería confuso), pero YA NO resetea `references` (es un adjunto independiente del control principal desde este slice, tiene sentido conservarlo al cambiar de tipo).

### Exportación (`evaluation-export.ts`)

`resolveRevealField` (VS-065, singular, exclusivo de `casilla`) → `resolveExtraFields` (VS-069, resuelve el array completo, sin distinción por `cellType` — si un campo no se llenó, su clave nunca se escribió en Runtime, así que simplemente no aparece; el gating ya ocurrió en el momento de guardar). Cada campo resuelto antepone su `label` si lo tiene, unidos por "; ". Las referencias de una celda con control principal propio se anexan como sufijo `[Referencias: ...]` (formato distinto del sufijo `" (Referencias: ...)"` de `formatOptionReferences`, que es específico de un label de opción) — reusa `formatReferenceSlots` ya existente, sin nueva lógica de resolución.

### Fuera de alcance (explícito)

- **`extraFields` en celdas de solo lectura (`editable === false`) o `calculado`** — mismo criterio que `references`/`content`: esas celdas no tienen control interactivo que acompañar.
- **`extraFields` en celdas `referencia`** — sin caso real observado; esa celda ya no tiene control principal que acompañar.
- **Verificación en producción con `pnpm dev`/typecheck/tests locales** — mismo criterio que el resto de este documento, por instrucción explícita del usuario.
