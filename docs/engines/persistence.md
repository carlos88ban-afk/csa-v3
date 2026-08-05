# Motor: `engine/persistence` (v1 — M7/VS-010)

Runtime de respuesta (`../architecture/overview.md`; `../SCOPE.md` M7: "Runtime de respuesta + guardar progreso"). Responsabilidad de este motor: convertir la página pública de solo lectura (`../engines/publishing.md`, M6/VS-009) en un formulario **interactivo** — el evaluado responde preguntas sobre una Evaluación publicada y su progreso se guarda automáticamente, sin necesidad de cuenta.

## Qué resuelve y qué no (límite con M8)

Este slice captura **respuestas de texto/número/selección** sobre los tipos de Elemento ya definidos en `form.md` v1. Adjuntar archivos como Evidencia (`tabla`, `upload`, tipos que dependen de R2/`engine/components`) es `M8/VS-011`, fuera de alcance aquí — mismo criterio que dejó esos tipos fuera de `form.md` v1.

## Decisión central: Respuesta ligada a la Evaluación (token), no a una identidad de evaluado

El dominio (`../domain/ubiquitous-language.md`) define **Respuesta (Submission)** como "envío/avance de un evaluado sobre una Evaluación". No existe concepto de cuenta de evaluado (`organization-user.md` solo cubre miembros de la Organización que construye/publica) ni está pedido en el roadmap. Igual que `getEvaluationByToken` en `publishing.md` usa el token como única credencial, la Respuesta se ata a `evaluationId`: **un enlace publicado = una sesión de respuesta compartida**. Si dos personas abren el mismo link y editan a la vez, gana el último autosave — mismo principio ya aceptado en `form.md` ("Fuera de alcance": sin colaboración concurrente, dado NFR-1 ~20 usuarios). No se inventa un sistema de identidad de evaluado que nadie pidió.

## Alcance v1

- Nueva entidad `Response` (tabla `response`, `packages/db/src/schema/response.ts`): una fila por (Evaluación, Subindicador) — no por Elemento individual, mismo grano que `formSchema` en Subindicador (`../domain/evaluation-hierarchy.md`): el Subindicador es la unidad de guardado.
- Página pública (`apps/web/app/evaluations/[token]/page.tsx`) deja de listar todo el árbol en un solo scroll y pasa a mostrar **un Subindicador a la vez**, con:
  - **Navegación en árbol persistente** (Dimensión → Indicador → Subindicador, numerada y colapsable) en vez de solo breadcrumb — la referencia visual del portal S&P Global CSA confirmó que esto es lo que permite saltar entre secciones de un Framework grande sin perder el lugar.
  - **Prev/Next** entre Subindicadores consecutivos (recorrido lineal del árbol aplanado), para completar todo el Framework sin volver a la navegación.
  - Render real de cada tipo de Elemento (`form.md`): `texto_corto`/`texto_largo` → input/textarea; `numero` → input numérico; `seleccion_unica` → radio; `seleccion_multiple` → checkboxes; `instruccion` → texto informativo; `banner` → aviso destacado con color según `variant` (`info`/`warning`, tokens `--accent-soft`/`--warn-soft` ya definidos en `design-system.md`, sin inventar paleta nueva).
  - **Autosave** con debounce 1500ms, mismo patrón exacto que el Builder (`form.md` "Autosave") — al cambiar una respuesta se dispara `PUT` al Subindicador actual; confirmación visual inline ("Guardado").
  - **Progreso**: por Subindicador = elementos tipo pregunta respondidos / total elementos tipo pregunta de su `formSchema` (`instruccion`/`banner` no cuentan, no capturan respuesta). Se agrega hacia Indicador/Dimensión/Framework sumando preguntas respondidas / total preguntas de todos los Subindicadores descendientes — un único número global (ej. "42% completado"), calculado en cliente a partir del snapshot + las Respuestas ya cargadas, sin columna nueva en DB (es derivado, no estado).
  - El punto del árbol junto a cada Subindicador refleja su estado: sin respuestas (neutral), parcialmente respondido (accent), completo (good) — reusa las variantes de color ya existentes en `design-system.md`/`ui.tsx`, sin paleta nueva.
- Sin campo de identidad de evaluado (nombre/email de quien responde) — ver "Decisión central". Si se necesita en el futuro (ej. para exportar quién respondió), es un cambio aditivo, no bloqueante hoy.

## Fuera de alcance (explícito)

- **Adjuntar Evidencia/archivos** (`engine/components` + R2) — `M8/VS-011`.
- **Validación de reglas de contenido al guardar** (`required`, `min`/`max`, etc. definidas en `form.md`): el motor v1 de persistencia guarda lo que el evaluado escribe, completo o no — igual que el Builder permite guardar un `formSchema` con labels vacíos. Bloquear el guardado por reglas de validación no está pedido; en todo caso sería UX (marcar visualmente qué falta), no un rechazo del autosave.
- **Fórmulas/condicionales** (`elementos` de tipo `calculado`, `condicional`) — dependen de `engine/formula`/`engine/rule`, M10.
- **Envío final / "submit" que cierra la Evaluación** — no está pedido; el modelo es guardar progreso continuamente (autosave), no un botón de envío único con estado "enviado" vs "borrador". Si se pide más adelante, es un campo adicional (`submittedAt`) sobre `Response` o `Evaluation`, no un rediseño.
- **Identidad de evaluado / multi-respondiente por Evaluación** — ver "Decisión central".
- **Exportación de resultados** — `M9/VS-012`.

## Estructura de `answers` (por Respuesta/Subindicador)

```ts
// Una entrada por elemento tipo pregunta del formSchema del Subindicador.
// Claves ausentes = no respondido todavía (no se rellena con null a propósito,
// mismo motivo que permitir label vacío en form.md: el autosave guarda
// estados intermedios, no solo formularios completos).
type AnswerValue = string | number | string[]; // string[] solo para seleccion_multiple (ids de opción elegidos)

interface ResponseAnswers {
  [elementId: string]: AnswerValue;
}
```

## Contratos (`packages/sdk-core`)

Nuevo archivo `packages/sdk-core/src/response.ts`, mismo patrón que `form-schema.ts`:

- `answerValue = z.union([z.string(), z.number(), z.array(z.string())])`.
- `responseAnswers = z.record(z.string(), answerValue)`.
- `upsertResponseInput = z.object({ answers: responseAnswers })`.
- Interfaz `Response` (entidad persistida: `id`, `evaluationId`, `subindicatorId`, `answers`, `createdAt`, `updatedAt`).

Exportado desde `index.ts`, junto a los ya existentes.

## Persistencia (`packages/db`)

Nuevo `packages/db/src/schema/response.ts`:

```ts
export const response = pgTable("response", {
  id: text("id").primaryKey(),
  evaluationId: text("evaluation_id").notNull().references(() => evaluation.id, { onDelete: "cascade" }),
  subindicatorId: text("subindicator_id").notNull(), // id dentro del snapshot — sin FK real, ver nota abajo
  answers: jsonb("answers").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("response_evaluationId_idx").on(table.evaluationId),
  unique("response_evaluationId_subindicatorId_unique").on(table.evaluationId, table.subindicatorId),
]);
```

**`subindicatorId` sin foreign key hacia `subindicator.id`, a propósito**: la Evaluación es un snapshot congelado (`publishing.md`) — el Subindicador original puede editarse o borrarse después de publicar sin afectar la Evaluación ya publicada. Si `subindicatorId` fuera FK hacia `subindicator`, borrar el Subindicador original rompería (o cascadearía sobre) Respuestas de una Evaluación que se supone inmutable. En vez de eso, `packages/db/src/domain/response-service.ts` valida en el servicio que `subindicatorId` exista dentro del `snapshot` de la Evaluación (`evaluationId`) antes de aceptar el `upsert` — el snapshot jsonb es la única fuente de verdad de "qué Subindicadores son válidos para esta Evaluación".

Funciones nuevas (archivo dedicado `response-service.ts`, mismo patrón que `evaluation-service.ts`):

- `upsertResponse(evaluationId, subindicatorId, answers)`: carga la Evaluación por id, valida que `subindicatorId` está en su `snapshot` (si no, `NotFoundError("subindicator")`), luego `INSERT ... ON CONFLICT (evaluationId, subindicatorId) DO UPDATE SET answers = ..., updatedAt = now()`.
- `listResponses(evaluationId)`: todas las Respuestas de una Evaluación (para hidratar el Runtime al cargar la página — progreso + valores ya guardados).

Sin `organizationId` en ninguna de las dos — mismo motivo que `getEvaluationByToken`: el acceso depende del `token` (resuelto a `evaluationId` en la capa de API), no de una sesión.

## API (`apps/web`)

Bajo el mismo prefijo `public/` que la Evaluación, por el mismo motivo documentado en `publishing.md` (el límite sin auth debe ser visible en la estructura de carpetas):

- `GET /api/public/evaluations/[token]/responses`: resuelve el token → `evaluationId` (`getEvaluationByToken`, 404 si no existe), retorna `listResponses(evaluationId)`.
- `PUT /api/public/evaluations/[token]/responses/[subindicatorId]`: resuelve el token, valida `upsertResponseInput` (zod), llama `upsertResponse`. 404 si el token no resuelve o si el `subindicatorId` no pertenece a esa Evaluación.

No se reutiliza `/api/evaluations` (autenticado) — igual que `/api/public/evaluations/[token]` ya es una ruta separada de `/api/evaluations/[id]`.

## UI (Runtime)

Reescritura de `apps/web/app/evaluations/[token]/page.tsx`. Deja de ser una sola columna centrada (`.page`) — nuevo layout de dos columnas (`.runtime-layout`: nav de árbol ancho fijo ~280px + contenido flexible), consistente con los tokens existentes (`--surface`, `--border`, `--accent`, `--space-*`) pero un contenedor propio, no `.page--wide`, porque el árbol lateral es persistente en toda la sesión de respuesta (no cabe en una columna de 840/960px).

- Estado en cliente: snapshot completo (ya se carga hoy), respuestas por subindicador (`Record<subindicatorId, ResponseAnswers>`, hidratado desde `GET .../responses` al montar), subindicador activo (por defecto el primero).
- Árbol lateral: Dimensión (no clickeable, solo agrupa) → Indicador (no clickeable, solo agrupa) → Subindicador (clickeable, cambia el activo). Punto de color por Subindicador según su progreso (ver "Alcance v1").
- Panel de contenido: título + descripción del Subindicador activo, luego sus Elementos en orden, cada uno con su input real; al cambiar un valor se actualiza el estado local y se dispara el debounce de autosave (mismo hook/patrón que el Builder de `form.md`, adaptado a `PUT .../responses/[subindicatorId]` en vez de `PATCH` del Subindicador).
- Barra superior del panel: `Pill` con "X% completado" (progreso global) + botones Prev/Next que mueven el subindicador activo dentro de la lista aplanada del árbol.
- Elemento `banner`: renderizado con fondo `--accent-soft` (variant `info`) o `--warn-soft` (variant `warning`) — reusa tokens semánticos existentes, no agrega colores.
- Estado vacío (`formSchema` null o sin elementos): mismo mensaje que hoy ("Este formulario todavía no tiene elementos"), pero dentro del panel de un solo Subindicador, no en un loop de toda la lista.

## Testing

Mismo patrón que VS-007/VS-009:

- `packages/sdk-core`: tests de `answerValue`/`responseAnswers`/`upsertResponseInput` (zod) — casos válidos por tipo de valor, casos inválidos.
- `packages/db`: test de integración contra Neon real — `upsertResponse` crea y luego actualiza (mismo `evaluationId`+`subindicatorId` no duplica fila, confirma el `ON CONFLICT`); `upsertResponse` con un `subindicatorId` que no pertenece al snapshot de la Evaluación lanza `NotFoundError`; borrar la Evaluación borra en cascada sus Respuestas.
- Verificación manual **contra producción** (no local, mismo criterio que VS-008/VS-009): publicar un Framework con preguntas reales, abrir el link público en una pestaña sin sesión, responder preguntas en varios Subindicadores usando Prev/Next y el árbol, confirmar autosave recargando la página (las respuestas persisten), confirmar con `curl` sin cookies que `GET .../responses` devuelve lo guardado, confirmar que el % de progreso y el color del árbol reflejan lo respondido.
