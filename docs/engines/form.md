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
