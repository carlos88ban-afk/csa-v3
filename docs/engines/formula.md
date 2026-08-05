# Motor: `engine/formula` (v1 — M10/VS-013)

Campos calculados (`../architecture/overview.md`). Responsabilidad de este motor: el tipo de Elemento `calculado`, pendiente desde `form.md` (M4/VS-007) — un valor derivado de una fórmula aritmética sobre otros Elementos numéricos del mismo Subindicador, recalculado en vivo mientras el evaluado responde.

## Decisión central: parser/evaluador a mano, sin librería de expresiones

Mismo principio ya aplicado en todo el proyecto (registry a mano en `components.md`, CSV a mano en `export.md`): una librería de parsing de expresiones (`mathjs`, `expr-eval`, etc.) es sobrepeso para un lenguaje de fórmulas deliberadamente mínimo — suma, resta, multiplicación, división, paréntesis y referencias a otros Elementos. Un tokenizer + parser recursivo-descendente de ~100 líneas cubre el 100% del alcance v1 sin justificar una dependencia nueva (NFR-3).

## Alcance v1

- Elemento `calculado`: `expression: string` con sintaxis `{elementId} + {otroId} * 2` — referencias entre llaves a otros Elementos por `id`, números literales, `+ - * /`, paréntesis, menos unario.
- Las referencias solo pueden apuntar a Elementos **`numero`** o **`calculado`** dentro del **mismo Subindicador** — consistente con la invariante "Subindicador = formulario independiente" (`ubiquitous-language.md`); no hay referencias entre Subindicadores.
- Un `calculado` puede referenciar otro `calculado` (composición), pero no puede formar un ciclo — se valida al guardar (ver "Validación").
- **El valor calculado se persiste como si fuera una respuesta más**: en vez de inventar un concepto nuevo de "valor derivado" separado de `Response.answers`, el Runtime recalcula la expresión en cada cambio relevante y —si el resultado es un número válido— lo escribe en `answers[elementId]` con el mismo autosave que cualquier pregunta (`persistence.md`). Esto es deliberado: reutiliza el 100% de la infraestructura ya construida y verificada (progreso, exportación CSV, autosave) sin tocarla — un `calculado` participa en el progreso y aparece en el CSV exportado exactamente igual que una pregunta normal, porque *funcionalmente lo es* (una pregunta que el sistema responde en vez del evaluado). Si la expresión no se puede evaluar (referencia sin responder, división por cero), la clave se omite de `answers` — mismo criterio que "claves ausentes = no respondido todavía".
- `component-registry.ts`: `{ type: "calculado", label: "Calculado", isQuestion: true, version: 1 }` — participa en progreso/exportación como cualquier pregunta (ver punto anterior).
- Formato de presentación: `decimals?: number` (default 2) — redondeo solo para mostrar, el valor guardado es el número completo sin redondear.

## Fuera de alcance (explícito)

- **Funciones** (`SUM`, `AVG`, `IF`, etc.) — v1 es aritmética directa entre referencias explícitas; una `SUM` sobre un rango no está pedida y requeriría decidir qué es "un rango" en un modelo de Elementos plano, no jerárquico.
- **Referencias entre Subindicadores** — rompería la invariante de independencia; si se pide, es un cambio de modelo mayor, no una extensión de este motor.
- **Tipos de dato no numéricos en la fórmula** (texto, fechas) — v1 solo opera sobre `numero`/`calculado`.
- **Edición del valor calculado por el evaluado** — se renderiza de solo lectura en el Runtime (ver `rule.md` no aplica aquí; es una restricción de UI, no una regla condicional).

## Validación (Builder / API)

Al guardar el `formSchema` (mismo `PATCH /api/subindicators/[id]` ya existente, sin ruta nueva), `formSchema` en `sdk-core` gana un `.superRefine()`: para cada Elemento `calculado`, extrae sus referencias (`extractExpressionReferences`) y descarta las que no apuntan a otro `calculado` (las referencias a `numero`, o a ids inexistentes, son válidas al guardar — igual que un `label` vacío, el formulario puede estar a medio construir). Con el subgrafo resultante (solo aristas `calculado` → `calculado`), un DFS detecta ciclos; si hay uno, `formSchema.safeParse` falla con un mensaje legible (`"Referencia circular en fórmulas: el-1 → el-2 → el-1"`). Una autorreferencia (`{el-1}` dentro de la fórmula del propio `el-1`) es el caso trivial de ciclo de longitud 1, cubierto por el mismo DFS sin caso especial.

## Contratos (`packages/sdk-core`)

Nuevo archivo `packages/sdk-core/src/formula.ts`:

- `parseFormula(expression: string): FormulaNode` — tokeniza y arma un AST; lanza `FormulaSyntaxError` (con mensaje y posición) si la sintaxis es inválida. Usado por el Builder para feedback inline y por `extractExpressionReferences`.
- `extractExpressionReferences(expression: string): string[]` — ids referenciados (parsea internamente; devuelve `[]` si la expresión no parsea, no lanza — usado en el `.superRefine()` de `formSchema`, que no debe reventar por una fórmula a medio escribir).
- `evaluateExpression(expression: string, values: Record<string, number>): number | undefined` — evalúa contra los valores numéricos actuales de los Elementos referenciados; `undefined` si la expresión no parsea, si falta algún valor referenciado, o en división por cero (nunca lanza — el Runtime lo usa en cada tecla, un error de cálculo no debe romper la página).

`formElement` (`form-schema.ts`) gana la rama `calculado`:

```ts
z.object({
  ...formElementBase, // incluye visibleIf, ver rule.md
  type: z.literal("calculado"),
  label: z.string(),
  helpText: z.string().optional(),
  expression: z.string(),
  decimals: z.number().int().nonnegative().optional(),
})
```

`formSchema` gana el `.superRefine()` de detección de ciclos descrito arriba.

## UI

- **Builder** (`.../subindicators/[subindicatorId]/page.tsx`): campo de texto para `expression` con validación inline vía `parseFormula` (mensaje de error legible bajo el input, mismo patrón visual que `alert`), selector numérico para `decimals`. El selector de "Agregar elemento" gana `calculado` desde el registry (sin cambios en el patrón ya existente, ya lee de `componentRegistry`).
- **Runtime** (`apps/web/app/evaluations/[token]/page.tsx`): el elemento `calculado` se renderiza como un input numérico deshabilitado (`disabled`) mostrando el valor recalculado; un `useEffect`/recomputación en cada render evalúa `evaluateExpression` contra las respuestas numéricas actuales del Subindicador activo y, si el resultado cambia respecto al guardado, actualiza el estado local y dispara el mismo autosave (mismo debounce que una respuesta normal) — el evaluado nunca lo edita directamente, pero el valor viaja por el mismo camino de guardado que todo lo demás.

## Testing

- `packages/sdk-core`: tests de `parseFormula` (expresiones válidas: literales, referencias, paréntesis, precedencia, menos unario; inválidas: paréntesis desbalanceados, token inesperado, referencia sin cerrar), `extractExpressionReferences`, `evaluateExpression` (resultado correcto, referencia faltante → `undefined`, división por cero → `undefined`), y el `.superRefine()` de ciclos en `formSchema` (autorreferencia, ciclo de 2 y 3 elementos, composición válida sin ciclo).
- Verificación manual **contra producción**: Subindicador con dos `numero` y un `calculado` que los suma, responder ambos y confirmar que el calculado se autoguarda y aparece en el progreso y en el CSV exportado (`export.md`); confirmar que guardar una fórmula con ciclo es rechazado por la API con 400.
