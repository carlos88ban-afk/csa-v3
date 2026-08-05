# Motor: `engine/rule` (v1 — M10/VS-013)

Visibilidad condicional (`../architecture/overview.md`). Responsabilidad de este motor: las "reglas condicionales" del hito M10 — mostrar u ocultar un Elemento según la respuesta de otro Elemento del mismo Subindicador.

## Decisión central: `visibleIf` como propiedad de cualquier Elemento, no un Elemento `condicional` separado

`ubiquitous-language.md` lista "condicional" entre los tipos de Elemento posibles. Implementarlo literalmente como un tipo de Elemento contenedor (que envuelve a otros Elementos y los muestra/oculta como grupo) requeriría anidamiento — romper el modelo plano `elements: FormElement[]` que sostiene todo lo construido desde `form.md` (Builder, Runtime, progreso, export). El nombre del milestone en `ROADMAP.md` es más preciso que el término suelto del glosario: **"reglas condicionales"**, no "un Elemento condicional". Se modela como `visibleIf?: Condition` opcional en `formElementBase` (todo Elemento, no solo preguntas — un `banner` también puede querer aparecer solo bajo cierta condición) — la misma reducción de alcance que ya se aplicó al término "condicional" cuando `form.md` decidió qué subconjunto de la tabla de `ubiquitous-language.md` construir primero.

## Alcance v1

- `Condition`: `{ elementId: string; operator: "equals" | "notEquals" | "contains" | "isAnswered" | "isEmpty"; value?: string | number }`. Una condición simple, sin árboles AND/OR — si se necesita combinar varias condiciones en el futuro, es una extensión aditiva (`conditions: Condition[]` + un operador de combinación), no un rediseño.
- `elementId` debe referenciar otro Elemento del **mismo Subindicador** (misma invariante que `formula.md`).
- Semántica por operador: `equals`/`notEquals` comparan el valor guardado contra `value` (funciona para `texto_corto/largo`, `numero`, `seleccion_unica`); `contains` comprueba que un array (`seleccion_multiple`) incluya `value`; `isAnswered`/`isEmpty` solo comprueban presencia, cualquier tipo (reutiliza el mismo criterio de "¿tiene respuesta?" que `persistence.md` usa para calcular progreso — mismo helper, no una segunda definición de "respondido").
- **Simplificación deliberada:** una condición se evalúa siempre contra la respuesta *guardada* del Elemento referenciado, sin importar si ese Elemento está actualmente visible u oculto. Esto evita por completo el problema de dependencias cíclicas de visibilidad (A depende de B, B depende de A) sin necesitar resolución recursiva ni detección de ciclos — no está pedido resolver ese caso en v1, y esta simplificación lo vuelve irrelevante en vez de necesitar código para manejarlo.
- Único chequeo de validación: `elementId` no puede ser el `id` del propio Elemento (autorreferencia sin sentido — no se puede condicionar la visibilidad de un Elemento sobre sí mismo). Se valida con el mismo `.superRefine()` de `formSchema` que ya introduce `formula.md` para ciclos de fórmulas (un solo lugar de validación cruzada entre Elementos).
- Un Elemento oculto por `visibleIf` no cuenta en el progreso ni se exporta en el CSV — se filtra antes de los cálculos ya existentes de `persistence.md`/`export.md` (ver "Integración").

## Fuera de alcance (explícito)

- **Combinación de condiciones (AND/OR)** — ver "Alcance v1".
- **Ocultar/mostrar Dimensiones, Indicadores o Subindicadores completos** — v1 es a nivel de Elemento individual dentro de un Subindicador; ocultar un Subindicador entero del árbol de navegación (`persistence.md`) no está pedido.
- **Reglas que además desactivan validación de "obligatorio"** — si un Elemento oculto tenía `required: true`, hoy simplemente no se le pide (no se le muestra ni se autoguarda su respuesta, ver "Integración"); no hay una interacción explícita adicional que resolver porque `engine/form` v1 nunca ejecuta las reglas de validación de contenido sobre una respuesta real (ver `form.md`, "Fuera de alcance").

## Contratos (`packages/sdk-core`)

Nuevo archivo `packages/sdk-core/src/rule.ts`:

- `condition` (zod): `z.object({ elementId: z.string().min(1), operator: z.enum(["equals","notEquals","contains","isAnswered","isEmpty"]), value: z.union([z.string(), z.number()]).optional() })`. Tipo derivado `Condition`.
- `isElementVisible(condition: Condition | undefined, answers: ResponseAnswers): boolean` — `true` si no hay condición; si la hay, resuelve `answers[condition.elementId]` y aplica el operador. Reutiliza la misma lógica de "¿tiene respuesta?" que ya existe para progreso (se factoriza un helper compartido `hasAnswer(value: AnswerValue | undefined): boolean` desde `persistence.md`/Runtime hacia `sdk-core`, en vez de mantenerlo duplicado en dos sitios — este motor lo mueve a `sdk-core/src/response.ts` porque ahora dos consumidores lo necesitan).

`formElementBase` (`form-schema.ts`) gana:

```ts
const formElementBase = {
  id: z.string().min(1),
  componentVersion: z.number().int().positive().optional(),
  visibleIf: condition.optional(), // ver rule.md
};
```

El `.superRefine()` de `formSchema` (introducido por `formula.md`) suma el chequeo de autorreferencia en `visibleIf` al mismo recorrido — un solo paso de validación cruzada, no dos.

## Integración con motores existentes

- **`persistence.md` (progreso, Runtime):** el cálculo de progreso y el render de Elementos filtran primero por `isElementVisible(el.visibleIf, answers)` antes de contar/renderizar — un Elemento oculto no aparece en el árbol de progreso ni en el panel de contenido.
- **`export.md` (CSV):** la misma función filtra las filas antes de armarlas — un Elemento oculto para la respuesta real de una Evaluación no aparece en su CSV (tiene sentido: nunca se le pidió al evaluado, no es "una pregunta sin responder", es una pregunta que no aplicaba).
- **`formula.md` (calculado):** un `calculado` puede tener su propio `visibleIf` como cualquier otro Elemento; si está oculto, no se recalcula ni se autoguarda (evita escribir un valor derivado de datos que el evaluado nunca vio pedidos).

## Testing

- `packages/sdk-core`: tests de `condition` (zod, casos válidos/inválidos por operador), `isElementVisible` (cada operador, elemento no respondido, `seleccion_multiple` con `contains`), autorreferencia rechazada por el `.superRefine()` de `formSchema`.
- Verificación manual **contra producción**: Subindicador con una pregunta `seleccion_unica` ("¿Aplica?") y otra pregunta con `visibleIf: { elementId: "aplica", operator: "equals", value: "si" }` — confirmar que aparece/desaparece en vivo al cambiar la respuesta de la primera, que no cuenta en el progreso mientras está oculta, y que no aparece en el CSV si nunca se mostró.
