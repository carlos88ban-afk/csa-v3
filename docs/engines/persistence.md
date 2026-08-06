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

## Estado por pregunta + flujo Approved/Submitted (VS-018)

Gap 3 de `../analysis/csa-sp-global-comparison.md`. S&P tiene 5 estados por pregunta: `Not Started → In Progress → Completed → Approved → Submitted`. Los dos primeros ya existen de forma **implícita** (derivados de si hay respuesta o no); `Completed` es una acción explícita del evaluado; `Approved`/`Submitted` son una **revisión hecha por otra persona** — que es exactamente la tensión con la "Decisión central" de este documento (sin identidad de evaluado).

**Resolución de la tensión** (decisión explícita, alcance completo pedido por el usuario — no la versión mínima): el lado del evaluado (enlace público, sin sesión) sigue exactamente igual que hoy — sin identidad, cualquiera con el link puede responder y marcar `Completed`. Pero `Approved`/`Submitted` **no se exponen ahí**: son una acción nueva que solo puede hacer un miembro **autenticado** de la Organización con permiso de escritura (`requireWriteAccess`, `owner`/`editor` — mismo gate que el resto del dominio desde `permission.md`, `evaluador` queda excluido por ser de solo lectura). Esto no inventa una identidad de evaluado — reutiliza 100% el RBAC ya construido en VS-014, tratando la aprobación como una acción de revisión del lado de la Organización, no del evaluado. Actualiza la nota "Fuera de alcance" de `permission.md` ("Permisos sobre Evidencias/Respuestas del evaluado — no aplica"): sigue siendo cierto para el lado público, pero ya no es cierto en general — la revisión (`Approved`/`Submitted`) sí depende de `member.role` desde VS-018.

### Los 5 estados

| Estado | Quién lo pone | Cómo se calcula |
|---|---|---|
| `not_started` | — | Derivado: no hay `answers[elementId]` y no hay estado explícito |
| `in_progress` | — | Derivado: hay `answers[elementId]` (`hasAnswer`) y no hay estado explícito |
| `completed` | Evaluado (público) | Explícito, guardado |
| `approved` | Miembro autenticado (`owner`/`editor`) | Explícito, guardado |
| `submitted` | Miembro autenticado (`owner`/`editor`) | Explícito, guardado |

Solo los 3 últimos se persisten — `not_started`/`in_progress` nunca se escriben, se calculan siempre al leer (mismo criterio que el resto del motor: "claves ausentes = no respondido todavía"). Esto minimiza escrituras (no hay que guardar nada solo por que el evaluado tecleó una respuesta) y evita un estado explícito que pueda desincronizarse de si hay o no una respuesta real.

### Persistencia: clave sintética, cero cambios de schema

Mismo patrón que `form.md` (VS-016/VS-017): el estado de un elemento se guarda en el mismo mapa `answers` bajo la clave sintética `` `${elementId}::status` `` → `"completed" | "approved" | "submitted"` (string, ya soportado por `answerValue`). **Cero cambios en el schema de `packages/db`.** `packages/sdk-core/src/response.ts` gana:

```ts
export const elementStatus = z.enum(["completed", "approved", "submitted"]);
export type ElementStatus = z.infer<typeof elementStatus>;

export type DerivedStatus = "not_started" | "in_progress" | ElementStatus;

export function statusKey(elementId: string): string {
  return `${elementId}::status`;
}

export function deriveStatus(explicit: string | undefined, answered: boolean): DerivedStatus {
  if (explicit === "completed" || explicit === "approved" || explicit === "submitted") return explicit;
  return answered ? "in_progress" : "not_started";
}
```

### Integridad: el lado público no puede fabricar una aprobación

Como la ruta pública (`PUT .../responses/[subindicatorId]`) no depende de sesión, hoy acepta el mapa `answers` completo tal cual lo mande el cliente — sin este resguardo, cualquiera podría escribir `{"el-1::status": "submitted"}` a mano (sin pasar por la ruta autenticada) y falsificar una aprobación. Nuevo resguardo server-side, `packages/sdk-core/src/response.ts`:

```ts
export class LockedElementError extends Error {
  constructor(public readonly elementId: string) {
    super(`element_LOCKED:${elementId}`);
    this.name = "LockedElementError";
  }
}

// Se corre en la ruta pública, nunca en la autenticada (ese lado es de
// confianza, mismo criterio que el resto de las rutas de escritura del
// dominio). `current` = lo que ya hay en DB para ese Subindicador (o {} si
// es la primera respuesta); `incoming` = el mapa completo que mandó el
// cliente.
export function assertPublicResponseUpdateAllowed(current: ResponseAnswers, incoming: ResponseAnswers): void {
  for (const [key, value] of Object.entries(incoming)) {
    if (!key.endsWith("::status")) continue;
    const elementId = key.slice(0, -"::status".length);
    const currentStatus = current[key];
    // Regla A: un estado ya aprobado/enviado es de solo lectura desde el
    // lado público — ni tocarlo ni "reafirmarlo" con otro valor distinto.
    if ((currentStatus === "approved" || currentStatus === "submitted") && value !== currentStatus) {
      throw new LockedElementError(elementId);
    }
    // Regla B: no se puede saltar directo a approved/submitted desde el
    // lado público — esas dos transiciones solo las hace la ruta autenticada.
    if ((value === "approved" || value === "submitted") && value !== currentStatus) {
      throw new LockedElementError(elementId);
    }
    // Regla C: no se puede marcar completed sin una respuesta real O N/A
    // (ver VS-019 más abajo — una pregunta N/A cuenta como resuelta).
    if (value === "completed" && !isAnswered(incoming[elementId], incoming[naKey(elementId)] as string | undefined)) {
      throw new LockedElementError(elementId);
    }
  }
  // Regla D: si un elemento está approved/submitted, su respuesta también
  // queda congelada desde el lado público (evita invalidar en silencio una
  // aprobación ya dada editando la respuesta debajo).
  for (const [key, currentValue] of Object.entries(current)) {
    if (!key.endsWith("::status")) continue;
    if (currentValue !== "approved" && currentValue !== "submitted") continue;
    const elementId = key.slice(0, -"::status".length);
    if (elementId in incoming && JSON.stringify(incoming[elementId]) !== JSON.stringify(current[elementId])) {
      throw new LockedElementError(elementId);
    }
  }
}
```

`apps/web/lib/api-errors.ts` gana una rama: `LockedElementError` → 403 `{ error: "element_LOCKED", elementId }`.

### Persistencia (`packages/db`)

`response-service.ts` gana:

- `getResponse(evaluationId, subindicatorId)`: lookup de una fila (o `null`) — no existía, solo `listResponses` (todas). Lo necesita la ruta pública para tener el `current` que exige `assertPublicResponseUpdateAllowed`, y la ruta de revisión para mergear el estado nuevo sobre los `answers` existentes sin pisarlos.
- `setElementStatus(evaluationId, subindicatorId, elementId, status: ElementStatus | null)`: lee la Respuesta actual (`{}` si no existe todavía), aplica `status` (o borra la clave si `null` — revertir), llama a `upsertResponse` con el mapa resultante. Sin resguardo de `assertPublicResponseUpdateAllowed` — la llama únicamente la ruta autenticada, que ya es de confianza.

### API

- `PUT /api/public/evaluations/[token]/responses/[subindicatorId]` (existente, `persistence.md`): gana un paso antes del `upsertResponse` — `getResponse` para obtener `current`, luego `assertPublicResponseUpdateAllowed(current?.answers ?? {}, incoming)`. Si lanza `LockedElementError`, la ruta responde 403 vía `toErrorResponse`. Sin cambios de contrato (`upsertResponseInput` sigue igual) ni de status 200 en el camino feliz.
- `PATCH /api/evaluations/[id]/responses/[subindicatorId]/status` (nueva, autenticada y tenant-scoped — mismo patrón que `evaluations/[id]/export`): `requireWriteAccess`, `getEvaluation(organizationId, id)` (ya existe, `export.md`) para confirmar que la Evaluación es de la Organización activa, body `setElementStatusInput = z.object({ elementId: z.string().min(1), status: elementStatus.nullable() })`, llama `setElementStatus`. 404 si la Evaluación no existe o no pertenece a la Organización. Un miembro `owner`/`editor` puede poner cualquiera de los 3 estados explícitos o `null` (revertir) — sin más restricción de orden que esa (mismo criterio ya documentado más arriba: "no está pedido" bloquear guardados por reglas de contenido; acá el actor ya es de confianza vía RBAC).

### UI

**Runtime (público, `apps/web/app/evaluations/[token]/page.tsx`)**:
- Cada pregunta gana un botón "Marcar como completo" (visible solo si `hasAnswer` es true y el estado derivado actual es `not_started`/`in_progress`) que escribe `answers[statusKey(el.id)] = "completed"` por el mismo camino de autosave que cualquier respuesta — sin ruta nueva del lado del evaluado.
- Editar la respuesta de una pregunta ya `completed` limpia su `::status` en el mismo commit (vuelve a quedar `in_progress`, derivado) — evita que quede una marca de "completo" sobre una respuesta que acaba de cambiar. Si el estado es `approved`/`submitted`, el control de respuesta se deshabilita (`disabled`/`readOnly`) — coherente con la Regla D del servidor, no solo una validación de UI.
- `Pill` junto al label de la pregunta con el estado derivado cuando es `completed`/`approved`/`submitted` (no se muestra para `not_started`/`in_progress`, mismo criterio que el `Pill` de "obligatorio").

**Revisión (nueva, autenticada, `apps/web/app/frameworks/[frameworkId]/evaluations/[evaluationId]/review/page.tsx`)**: página nueva bajo la jerarquía del Builder (no bajo `/evaluations/[token]`, que es la ruta pública — evita cualquier ambigüedad de ruteo). Recorre el snapshot igual que `export.md` (Dimensión → Indicador → Subindicador → Elementos tipo pregunta), una fila por pregunta con: label, respuesta actual (solo lectura), `Pill` de estado derivado, y botones **Aprobar** (habilitado si el estado derivado es `completed` o superior), **Enviar** (habilitado si es `approved`), **Revertir** (habilitado si es `completed`/`approved`/`submitted`, retrocede exactamente un nivel: `submitted→approved`, `approved→completed`, `completed→null`). La página de Framework (`export.md` → UI) gana un link "Revisar" junto a "Exportar CSV"/"Revocar" por cada Evaluación publicada.

### Exportación (`export.md`)

`buildCsv` gana una columna `Estado` (después de `Respuesta`) — `deriveStatus` aplicado igual que en Runtime/Revisión, mismo mapa `answers` ya disponible.

### Fuera de alcance (explícito)

- **Enforzar orden estricto en la ruta autenticada** (ej. no dejar `submitted` sin pasar por `approved` primero) — el actor ya es de confianza vía RBAC, mismo criterio que el resto de rutas de escritura del dominio (sin reglas de validación de contenido bloqueantes).
- **Notificaciones** (avisar por email/UI cuando algo pasa a `approved`/`submitted`) — no hay proveedor de email decidido (mismo motivo que `organization-user.md`).
- **Historial de quién aprobó/envió y cuándo** — v1 solo guarda el estado actual, no un log de auditoría. Aditivo si se pide (una tabla de eventos separada, no bloquea este slice).

## N/A + comentario confidencial por pregunta (VS-019)

Gap 4 de `../analysis/csa-sp-global-comparison.md`: en S&P, toda pregunta tiene una opción "Not applicable" y un textarea "Confidential additional comments" (máx. 5000 caracteres). A diferencia de `url_publica` (VS-017), esto **no es un tipo de Elemento nuevo** — es una capacidad universal de todo Elemento tipo pregunta (excepto `calculado`, que el Runtime escribe automáticamente y el evaluado no edita), sin config nueva en el Builder: S&P no hace esto configurable por pregunta, siempre está disponible.

**Bug real encontrado y corregido durante la verificación en producción de este slice**: la Regla C de `assertPublicResponseUpdateAllowed` (VS-018, arriba) todavía usaba `hasAnswer` en vez de `isAnswered` — el Runtime permitía pulsar "Marcar como completo" sobre una pregunta N/A sin respuesta real, pero el servidor la rechazaba con `element_LOCKED` (403) porque no sabía de N/A. Corregido cambiando esa regla a `isAnswered` (ya reflejado en el bloque de código de la sección VS-018 más arriba) — mismo criterio en cliente y servidor.

### Persistencia: dos claves sintéticas más, mismo patrón que VS-016/VS-017/VS-018

```ts
export function naKey(elementId: string): string {
  return `${elementId}::na`;
}
export function commentKey(elementId: string): string {
  return `${elementId}::comment`;
}
// "¿Cuenta como resuelta para progreso/Completar?" — una pregunta marcada
// N/A cuenta como resuelta aunque answers[elementId] esté vacío/ausente.
export function isAnswered(value: AnswerValue | undefined, na: string | undefined): boolean {
  return hasAnswer(value) || na === "true";
}
```

- `${elementId}::na` → `"true"` (string, ya soportado por `answerValue`) cuando está marcada; **ausente** = no marcada (mismo criterio "claves ausentes = no respondido" — nunca se escribe `"false"`, desmarcar borra la clave).
- `${elementId}::comment` → `string` (ya soportado), sin límite de forma en el servidor (mismo criterio que el resto del motor: no hay reglas de contenido bloqueantes); el Runtime limita a 5000 caracteres con `maxLength` nativo del `<textarea>`, igual que `maxLength` en `texto_largo`.
- Cero cambios de schema en `packages/db` — tercera vez que este patrón extiende `engine/persistence` sin tocarlo (VS-016/VS-017/VS-018 ya lo establecieron).

### Integración con progreso, "Completar" (VS-018) y exportación

`isAnswered` (arriba) reemplaza a `hasAnswer` en los tres lugares donde "¿esta pregunta ya está resuelta?" importa:

- **Progreso** (`progressOf` en el Runtime): una pregunta N/A cuenta como respondida — es una resolución válida, no una pendiente.
- **"Marcar como completo" (VS-018)**: `canComplete` pasa a depender de `isAnswered(value, na)`, no solo de `hasAnswer(value)` — se puede completar una pregunta marcada N/A sin haber escrito una respuesta.
- **Exportación CSV**: si la pregunta está marcada N/A, la columna `Respuesta` muestra literalmente `"N/A"` (sin importar si además hay un valor en `answers[elementId]` de un intento anterior) — un evaluador revisando el CSV necesita ver "N/A" explícito, no una celda vacía indistinguible de "nunca se tocó".

### Confidencialidad: aclaración de alcance (no es control de acceso)

**"Confidencial" es una etiqueta/convención de UI, no una restricción de acceso real** — decisión explícita, no un descuido. La plataforma no tiene niveles de visibilidad distintos sobre una Respuesta: el lado público (`persistence.md`, "Decisión central") ya es una sesión compartida sin identidad, y del lado autenticado cualquier rol con lectura (incluido `evaluador`, `permission.md`) ya puede ver todas las Respuestas vía la página de Revisión (VS-018) y exportar CSV. Ocultar el comentario de ciertos roles sería un control de acceso granular por campo que `permission.md` excluye explícitamente de v1 ("Fuera de alcance": *access-control* custom/granular por recurso). El comentario se incluye en el CSV (decisión confirmada con el usuario) exactamente igual que cualquier otra respuesta.

### UI

**Runtime (público)**: cada Elemento tipo pregunta (excepto `calculado`) gana, debajo de su control principal: checkbox "No aplica" (escribe `naKey(element.id)`, autosave por el mismo camino de siempre) y `<textarea maxLength={5000}>` "Comentario confidencial" (escribe `commentKey(element.id)`). Marcar "No aplica" deshabilita el control principal (mismo tratamiento visual que `locked` en VS-018, aunque es un estado independiente — un elemento puede estar N/A sin estar `approved`/`submitted`) sin borrar el valor ya escrito, por si se desmarca.

**Revisión (autenticada, VS-018)**: cada fila de pregunta muestra un `Pill` "N/A" cuando aplica, y el comentario confidencial visible en un bloque de solo lectura debajo del label (mismo criterio de "sin niveles de acceso" de arriba).

### Exportación (`export.md`)

`buildCsv` gana una columna `Comentario confidencial` (después de `Estado`) — vacía si no hay comentario. `formatAnswer` intercepta el caso N/A antes de formatear por tipo (ver arriba, "N/A" literal en vez del valor de `answers[elementId]`).

## Botones Save/Cancel/Reset explícitos (VS-020)

Gap 5 de `../analysis/csa-sp-global-comparison.md`: S&P tiene botones `#saveButton`/`#cancelButton`/`#resetButton` junto al autosave. **Decisión confirmada con el usuario**: `Cancel` y `Reset` tienen el mismo efecto en esta plataforma — ambos vuelven al último estado guardado en el servidor (no hay una noción separada de "vaciar la respuesta"). Se exponen como dos botones igual (mismos labels que S&P, menor fricción para quien ya conoce ese portal), pero comparten una sola implementación.

Esto es **aditivo sobre el autosave existente, no lo reemplaza** — el debounce de 1500ms sigue funcionando igual; los tres botones son control explícito adicional, mismo criterio que el resto de este motor (nunca se quita una capacidad, se agrega encima).

### Estado nuevo en cliente: última foto confirmada por el servidor

Hoy `answersBySub` (estado local) mezcla, sin distinción, "lo que el evaluado está editando" y "lo que ya se guardó" — no hay forma de volver atrás. Se agrega `lastSavedBySub` (un `useRef<Record<subindicatorId, ResponseAnswers>>`, no `useState` — es una caché de lectura, no dispara render por sí sola):

- Se inicializa en el mismo efecto que hidrata `answersBySub` desde `GET .../responses` (la foto del servidor al cargar la página).
- Se actualiza cada vez que un autosave (automático o forzado por el botón Save) **confirma éxito** — el payload recién guardado pasa a ser la nueva "última foto".

### Save

Fuerza el autosave pendiente ya, sin esperar el debounce — cancela el `setTimeout` activo (si hay) y llama directo a la función de guardado con `answersBySub[activo]`. No cambia la forma de guardar (mismo `PUT`), solo el momento.

### Cancel / Reset (misma función)

Revierte `answersBySub[subindicatorActivo]` a `lastSavedBySub[subindicatorActivo]` (o `{}` si nunca se guardó nada para ese Subindicador) y cancela cualquier autosave pendiente — sin ese segundo paso, el debounce en curso sobreescribiría la reversión 1.5s después con el estado que se acaba de descartar. También limpia la marca de "Subindicador sucio" (`dirtySubRef`) para que el efecto de autosave no dispare un guardado redundante del estado recién revertido (ya es idéntico a lo que el servidor tiene).

### UI

Barra superior del Runtime (`.runtime-topbar`, junto al indicador de estado ya existente): tres botones — `Guardar` (deshabilitado si no hay cambios pendientes respecto a `lastSavedBySub`), `Cancelar` y `Restablecer` (ambos deshabilitados en el mismo caso, mismo criterio). "¿Hay cambios pendientes?" se calcula comparando `answersBySub[activo]` contra `lastSavedBySub[activo]` (comparación superficial de JSON — el tamaño del mapa de respuestas de un Subindicador es chico, no justifica una librería de diff).

## Estado por nodo en el árbol (VS-027)

Ajuste menor de `../analysis/csa-sp-global-comparison.md` ("Segunda inspección"): S&P marca estado de completitud (`status0..status4`) en **cada nodo del árbol**, ramas incluidas — la plataforma hoy solo pinta el punto de color (`tree-dot`) en los Subindicadores (hojas, ver `progressOf` en "UI (Runtime)" arriba); Dimensión e Indicador no tienen ningún indicador visual de progreso, solo el caret de colapsar/expandir.

**No es un estado nuevo persistido — es agregación derivada de lo que ya existe**, mismo criterio que la numeración (VS-021, "derivada, no persistida"): el progreso de un Indicador es la suma de `answered`/`total` de sus Subindicadores; el de una Dimensión, la suma de sus Indicadores. Cero cambios en `packages/db`/`response.ts` — es una función de agregación sobre datos que el cliente ya tiene cargados (`answersBySub` completo, hidratado al montar).

```ts
// apps/web/app/evaluations/[token]/page.tsx — junto a progressOf ya existente
// (progressOf vive en el Runtime, no en sdk-core, desde VS-010; se mantiene
// ahí por consistencia, no se relocaliza a sdk-core solo para este slice).
function indicatorProgress(ind: SnapshotIndicator, answersBySub: Record<string, ResponseAnswers>) {
  return ind.subindicators.reduce(
    (acc, sub) => {
      const p = progressOf(sub, answersBySub[sub.id]);
      return { answered: acc.answered + p.answered, total: acc.total + p.total };
    },
    { answered: 0, total: 0 },
  );
}

function dimensionProgress(dim: SnapshotDimension, answersBySub: Record<string, ResponseAnswers>) {
  return dim.indicators.reduce(
    (acc, ind) => {
      const p = indicatorProgress(ind, answersBySub);
      return { answered: acc.answered + p.answered, total: acc.total + p.total };
    },
    { answered: 0, total: 0 },
  );
}
```

### UI

Árbol de navegación (`.runtime-nav`): los botones de Dimensión e Indicador (hoy solo caret + número + título) ganan el mismo `tree-dot` que ya usan los Subindicadores, calculado con `dimensionProgress`/`indicatorProgress` y el mismo criterio de 3 estados (`total === 0` → sin punto; `answered === 0` → `neutral`; `answered === total` → `good`; si no, `accent`). Sin cambio de layout — el punto se agrega al lado del caret existente, mismo patrón visual que ya usan los Subindicadores.

### Fuera de alcance (explícito)

- **Estado por nodo en la página de Revisión** (`review/page.tsx`) o en el Builder — el gap observado en S&P es específicamente del árbol de navegación del Runtime; Revisión ya muestra estado por pregunta individual (VS-018) y el Builder no tiene árbol (`../domain/evaluation-hierarchy.md`, "Fuera de alcance"). Aditivo si se pide.
- **Los 5 estados de S&P (`status0..status4`) por nodo** — igual que el resto del motor, la plataforma usa el criterio de 3 colores ya establecido (`neutral`/`accent`/`good`) derivado de progreso, no el flujo completo Approved/Submitted (VS-018) a nivel de rama — ese flujo sigue siendo exclusivamente por pregunta.

## Testing

Mismo patrón que VS-007/VS-009:

- `packages/sdk-core`: tests de `answerValue`/`responseAnswers`/`upsertResponseInput` (zod) — casos válidos por tipo de valor, casos inválidos.
- `packages/db`: test de integración contra Neon real — `upsertResponse` crea y luego actualiza (mismo `evaluationId`+`subindicatorId` no duplica fila, confirma el `ON CONFLICT`); `upsertResponse` con un `subindicatorId` que no pertenece al snapshot de la Evaluación lanza `NotFoundError`; borrar la Evaluación borra en cascada sus Respuestas.
- Verificación manual **contra producción** (no local, mismo criterio que VS-008/VS-009): publicar un Framework con preguntas reales, abrir el link público en una pestaña sin sesión, responder preguntas en varios Subindicadores usando Prev/Next y el árbol, confirmar autosave recargando la página (las respuestas persisten), confirmar con `curl` sin cookies que `GET .../responses` devuelve lo guardado, confirmar que el % de progreso y el color del árbol reflejan lo respondido.
