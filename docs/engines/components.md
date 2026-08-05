# Motor: `engine/components` (v1 — M5/VS-008)

Registry de componentes pluggable y versionado (`../architecture/overview.md`, `../VISION.md` F2: "Cada elemento es configurable; los componentes son *pluggable* y versionados"). Responsabilidad de este motor: ser la **única fuente de verdad** sobre qué tipos de elemento existen, su metadata (etiqueta, si es "pregunta", versión de su forma) — reemplazando la duplicación implícita que `engine/form` v1 (VS-007) dejó repartida entre el `formElement` de `sdk-core`, el diccionario de etiquetas y el `switch` de valores por defecto en la UI del Builder.

## Qué NO es este motor (para evitar sobre-alcance)

"Pluggable" aquí significa **arquitectura de un solo lugar de verdad para tipos de componente definidos en código por desarrolladores**, no un constructor no-code de tipos de componente nuevos para administradores. `../VISION.md` dice "el administrador nunca programa": eso se cumple porque el administrador **elige y configura** elementos de un catálogo ya construido (vía el Builder), no porque pueda inventar un tipo de elemento nuevo con su propia lógica de validación — eso seguiría siendo trabajo de desarrollo. Ver "Fuera de alcance" para el detalle.

## Alcance v1

- `packages/sdk-core/src/component-registry.ts` (nuevo): un manifiesto único (`componentRegistry`) con una entrada por tipo de elemento — `type`, `label` (para la UI), `isQuestion` (reemplaza el `Set`/type-guard hardcodeado de VS-007), `version` (número de versión de la *forma* de ese tipo de componente).
- Chequeo de exhaustividad en tiempo de compilación: si `FormElement["type"]` (la unión discriminada de `form-schema.ts`) gana o pierde un tipo sin que `componentRegistry` se actualice en el mismo cambio, TypeScript falla el build. Esto es lo que hace el registry "la fuente de verdad" en la práctica — no un mecanismo de carga dinámica en runtime.
- Versionado por elemento: cada instancia de `FormElement` (dentro de un `formSchema`) gana un campo opcional `componentVersion: number`, poblado con la versión actual del registry al momento de **crear** el elemento en el Builder. No se reescribe retroactivamente al editar — un elemento creado bajo la versión 1 de `seleccion_unica` sigue declarando `componentVersion: 1` aunque el registry avance a la versión 2 en el futuro.
- La UI del Builder (Form Editor, VS-007) deja de tener su propio diccionario de etiquetas (`ELEMENT_TYPE_LABELS`) y su propio `Set` de tipos-pregunta (`QUESTION_TYPES`): ambos se leen del `componentRegistry` importado de `sdk-core`.

## Fuera de alcance (explícito)

- **Componentes definidos por administradores en tiempo de ejecución** (un "constructor de tipos de componente" no-code) — sigue siendo trabajo de desarrollador vía código y despliegue. Si en el futuro el producto necesita que cada Organización defina sus propios tipos de elemento, es una extensión mayor que requiere su propia ADR (persistencia en BD, sandboxing de validación, etc.) — no está pedido por `../VISION.md`/`../SCOPE.md` hoy.
- **Registry persistido en base de datos** (una tabla `component_definition`) — v1 vive en código TypeScript (`componentRegistry` es un array estático), no en Postgres. La mención de `ComponentDefinition` con `revisionNumber` en `../domain/ubiquitous-language.md` se resuelve aquí como el par `(type, version)` versionado en código, no como una entidad de base de datos — no hay necesidad real de que cambie en runtime sin desplegar código nuevo.
- **Motor de migración automática** de elementos cuando su `componentVersion` queda desactualizado respecto al registry — se deja el campo `componentVersion` grabado para que sea *posible* construir esa migración más adelante, pero no se construye la lógica ahora (los 7 tipos siguen en versión 1, no hay nada que migrar todavía).
- **Nuevos tipos de elemento** (`tabla`, `grid`, `repetible`, `upload`, `evidencia`, `calculado`, `condicional` — ver `../domain/ubiquitous-language.md`) — la arquitectura de registry los podría alojar en el futuro, pero agregarlos ahora sin sus motores de soporte (Cloudflare R2/M8, `engine/formula`+`engine/rule`/M10) produciría componentes a medio terminar, contra la regla del proyecto de no dejar implementaciones a medio hacer. Este slice **migra los 7 tipos ya construidos en VS-007** al registry; no amplía el catálogo.

## Estructura

```ts
interface ComponentDefinition {
  type: FormElement["type"]; // el discriminante ya definido en form-schema.ts
  label: string;              // etiqueta humana para el selector "Agregar elemento"
  isQuestion: boolean;        // true: texto_corto/largo, numero, seleccion_unica/multiple — captura respuesta
  version: number;            // versión de la *forma* de este tipo de componente, hoy 1 para los 7
}

const componentRegistry: readonly ComponentDefinition[]; // 7 entradas, una por tipo v1
```

`formElement` (el `z.discriminatedUnion` de `form-schema.ts`) no se deriva mecánicamente del registry — se mantiene como está, escrito explícitamente rama por rama (derivar un discriminated union de zod desde un array mapeado pierde inferencia de tipos fuerte en TypeScript). El registry y la unión se mantienen consistentes mediante el chequeo de exhaustividad en tiempo de compilación descrito arriba, no mediante generación de uno a partir del otro.

## Contratos (`packages/sdk-core`)

- `form-schema.ts`: `formElementBase` gana `componentVersion: z.number().int().positive().optional()`.
- `component-registry.ts` (nuevo): exporta `componentRegistry` y el tipo `ComponentDefinition`. Exportado desde `index.ts`.

## UI (Builder)

`apps/web/.../subindicators/[subindicatorId]/page.tsx` (Form Editor, VS-007) se actualiza para:

- Construir el selector "Agregar elemento" iterando `componentRegistry` en vez del `Record<FormElement["type"], string>` hardcodeado.
- Reemplazar el `isQuestion()` type-guard basado en un `Set` local por una consulta al `isQuestion` del registry.
- `newElement(type)` sigue viviendo en la UI (es fábrica de valores por defecto, específica de cada tipo — no es metadata reusable entre Builder y un futuro Runtime), pero ahora graba `componentVersion` leyendo la versión actual del registry para ese tipo.

## Testing

- `packages/sdk-core`: test de exhaustividad (que cada `type` de `formElement` tenga una entrada en `componentRegistry` y viceversa) — aunque el chequeo de TypeScript ya lo garantiza en compile-time, un test runtime simple documenta la invariante y la protege si alguien relaja el tipo accidentalmente.
- Sin Playwright todavía (`../TECH_DEBT.md` TD-003) — verificación manual en navegador real. Para este slice, contra producción (`https://csa-v3-web.vercel.app`) en vez de local, a pedido del usuario.
