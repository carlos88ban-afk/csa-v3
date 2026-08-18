# Dominio — Unidades de Negocio y Evaluación Corporativa (VS-050+)

> **Estado de implementación (2026-08-17)**: backend completo (VS-050 schema/assignments, VS-051 partición de `response`, VS-052 `dueDate`/bloqueo, VS-053 acceso autenticado + exclusiones). UI completada en VS-054 y VS-055, **ambas verificadas end-to-end en producción** (`csa-v3-web.vercel.app`): Runtime compartido público/autenticado (`RuntimeCore`/`RuntimeAdapter` en `app/evaluations/[token]/page.tsx`), panel Publicar en Builder (asignación de unidades, `dueDate`/`contactEmail`), eliminación de `frameworks/[frameworkId]/page.tsx`, `DueDateBanner` en ambos modos, export XLSX consolidado (commit `3ae783f`), dashboard de avance corporativo por unidad (commit `c592d98`). Diferido, sin construir todavía: editor de exclusiones por elemento (UI — el backend ya existe, hoy se asigna/desasigna la unidad completa desde el panel Publicar), rutas de evidencia autenticadas (espejo de las públicas), bloqueo proactivo del formulario en cliente por `dueDate` vencido (hoy solo el servidor lo rechaza).

Extiende `organization-user.md` (jerarquía de Organización) y supera partes de `engines/publishing.md` (acceso anónimo por token → acceso autenticado por sesión + org). Motivado por un caso real de uso: un corporativo (ej. "Intercorp Retail") publica UNA evaluación que se aplica a MÚLTIPLES unidades de negocio (ej. "Supermercados Peruanos", "Farmacias Peruanas"), cada una con visibilidad de un subconjunto distinto de preguntas, sin visibilidad cruzada entre unidades, con exportación e in-platform dashboard consolidados solo para el corporativo.

## Decisión central: unidad de negocio = Organization propia, vinculada a una matriz

Cada unidad de negocio es su propio tenant Better Auth (`Organization`), con sus propios `Member`/`Invitation`, exactamente igual que hoy. Se añade un campo `parentOrganizationId` (nullable, self-reference) a `Organization`:

- `parentOrganizationId = null` → organización raíz (puede ser un corporativo con hijas, o una organización independiente sin jerarquía, como todas las existentes hoy).
- `parentOrganizationId = <id>` → unidad de negocio, hija de esa organización.

Se descartaron dos alternativas: (a) un solo tenant con "sub-tenant" modelado como tabla nueva (roto el patrón `organizationId` ya establecido en todo el dominio, requeriría dos conceptos de tenant-scoping conviviendo); (b) unidades de negocio como filas dentro de la organización matriz sin ser tenants propios (no permite que cada unidad tenga sus propios miembros/roles aislados, que es requisito explícito: un usuario de una unidad no debe poder ver nada de otra).

**Jerarquía de un solo nivel.** No se modela recursión matriz-de-matrices — `parentOrganizationId` apunta siempre a una raíz. No pedido, se puede extender después sin romper el modelo (sería solo relajar la validación).

### Implementación: Better Auth `additionalFields`, no columna manual

`packages/db/src/schema/auth.ts` es generado (`pnpm db:generate-auth-schema`, corre `@better-auth/cli generate`) — editarlo a mano se pierde en la próxima regeneración. Better Auth soporta extender cualquier tabla del plugin vía la opción `schema` del plugin `organization({...})`:

```ts
// packages/db/src/auth.ts
organization({
  // ...config existente...
  schema: {
    organization: {
      additionalFields: {
        parentOrganizationId: {
          type: "string",
          required: false,
          references: { model: "organization", field: "id" },
        },
      },
    },
  },
}),
```

Verificado contra el paquete instalado (`better-auth@1.6.25`, `dist/plugins/organization/schema.d.mts`): `Options["schema"][tableName].additionalFields` es exactamente este shape y se infiere automáticamente en el tipo de `auth.api.createOrganization`/`authClient.organization.create` etc. Tras añadir esto, correr `pnpm db:generate-auth-schema` para regenerar `schema/auth.ts` con la columna nueva, luego `drizzle-kit push`.

**Paso manual requerido tras CADA regeneración:** el CLI de Better Auth genera la self-reference (`parentOrganizationId` → `organization.id`, misma tabla) sin anotar el tipo de retorno del callback de `.references()`, lo que rompe `tsc` (TS7022/TS7024 — drizzle-orm no puede inferir el tipo de una self-reference circular sin ayuda). Hay que añadir a mano, cada vez que se regenera: `import { type AnyPgColumn } from "drizzle-orm/pg-core"` y anotar `(): AnyPgColumn => organization.id` en vez de `() => organization.id`. Es la única edición manual tolerada sobre este archivo generado — documentada aquí para no perderla en la próxima regeneración.

## Asignación de evaluación a unidades de negocio

Nueva tabla `evaluation_assignment` (`packages/db/src/schema/evaluation-assignment.ts`):

- `id`, `evaluationId` (FK → `evaluation.id`, cascade), `businessUnitOrganizationId` (FK → `organization.id`, cascade) — a qué unidad de negocio se le asigna esta Evaluación.
- `unique(evaluationId, businessUnitOrganizationId)` — una unidad no puede estar asignada dos veces a la misma Evaluación.
- Índice en `businessUnitOrganizationId` (para resolver "qué evaluaciones me aplican" al hacer login).

Solo se puede asignar una Evaluación a organizaciones cuyo `parentOrganizationId` sea igual al `organizationId` (matriz) de la Evaluación — invariante validada en el service, no en DB (mismo patrón que el resto del dominio: `NotFoundError` si no cumple).

### Filtrado de preguntas por unidad — granularidad `FormElement` individual

Confirmado con el usuario (corrigiendo una asunción anterior de este documento): la exclusión debe poder marcarse por **elemento individual** dentro de un `formSchema`, no solo por Subindicador completo.

Esto NO requiere cambiar el grano de `response` (sigue siendo una fila por `(evaluationId, subindicatorId, businessUnitOrganizationId)`, ver siguiente sección) porque `answers` (jsonb) ya está indexado internamente por `elementId` — cada `FormElement` tiene su propio `id` estable (`packages/sdk-core/src/form-schema.ts`, usado hoy por el motor de fórmulas/`visibleIf` para referenciarse entre sí). Filtrar a nivel de elemento es entonces un problema de **qué se sirve y qué se acepta**, no de reestructurar el almacenamiento:

- Al construir el snapshot filtrado para una unidad (`GET /api/evaluations/[id]/for-business-unit`, ver "Acceso del evaluado"), se recorren los `elements` de cada `formSchema` del snapshot y se eliminan los excluidos para esa unidad. Si un Subindicador queda con `elements: []` tras filtrar, igual aparece en el árbol (con su numeración) pero sin contenido — no se oculta el nodo completo automáticamente, para no generar confusión de numeración discontinua entre Subindicadores con y sin preguntas.
- Al guardar una respuesta (`response-service.ts`), se valida que ninguna clave de `answers` corresponda a un `elementId` excluido para `session.activeOrganizationId` en esa Evaluación — mismo patrón ya existente de "validar contra el snapshot" (`engines/publishing.md`, sección Persistencia), extendido con el filtro de exclusiones.
- El cálculo de progreso por unidad (ver "Aislamiento de progreso") cuenta sobre el total de elementos aplicables tras exclusión, no sobre el total del snapshot completo.

Tabla `evaluation_assignment_exclusion`:

- `id`, `evaluationAssignmentId` (FK, cascade), `subindicatorId` (texto, sin FK — mismo patrón que `response.subindicatorId`, el snapshot es la fuente de verdad), `elementId` (texto, **nullable**, sin FK).
- `elementId = null` → excluye el Subindicador completo (todos sus elementos). `elementId = <id>` → excluye solo ese elemento puntual dentro del Subindicador. Un único mecanismo cubre ambos casos: "esto no aplica a esta unidad" a nivel grueso (Subindicador) o fino (pregunta suelta), sin dos tablas distintas.
- `unique(evaluationAssignmentId, subindicatorId, elementId)` — evita duplicar la misma exclusión (Postgres trata múltiples `NULL` en `elementId` como no-iguales entre sí en un unique compuesto, así que esto NO impide guardar exclusiones "Subindicador completo" para varios Subindicadores distintos bajo la misma asignación; sí impide duplicar la exclusión "Subindicador completo" dos veces para el mismo Subindicador, que es lo que se busca evitar. Ver nota de implementación abajo).
- Modela **exclusiones**, no inclusiones: por defecto una unidad ve TODO el snapshot; el admin marca qué excluir. Confirmado por el ejemplo del usuario (140 preguntas totales, una unidad ve 120): el caso típico es "la mayoría aplica, algunas no".

**Nota de implementación sobre el unique compuesto con `elementId` nullable:** como Postgres no puede usar un `NULL` para deduplicar filas "Subindicador completo" repetidas (cada `NULL` cuenta como distinto), la deduplicación de la exclusión "Subindicador completo" (`elementId = null`) se hace a nivel de aplicación (service layer: `INSERT ... ON CONFLICT` no sirve aquí, se valida con un `SELECT` previo o un índice único parcial `WHERE elementId IS NULL` — a decidir en implementación, documentar la elección cuando se escriba el código).

## Acceso del evaluado: autenticado, no por token anónimo

Supera la Decisión central de `engines/publishing.md` (`getEvaluationByToken` sin sesión) **solo para evaluaciones con asignación a unidades de negocio**. Confirmado con el usuario: "Sí, requiere cuenta y login".

- El usuario se autentica (Better Auth, flujo ya existente) y su `activeOrganizationId` de sesión determina la unidad de negocio.
- Nueva ruta autenticada `GET /api/evaluations/[id]/for-business-unit` (reemplaza el consumo público de `/api/public/evaluations/[token]` en Runtime cuando la Evaluación tiene asignaciones): resuelve `evaluation_assignment` para `(evaluationId, session.activeOrganizationId)`; 403 si no existe asignación para esa organización; aplica las exclusiones de `evaluation_assignment_exclusion` filtrando el snapshot antes de devolverlo (el Subindicador excluido no aparece en el árbol ni en la numeración — la numeración ya es derivada dinámicamente por Builder/Runtime desde VS-021/VS-049, así que excluir un nodo del árbol servido automáticamente renumera lo que sí se ve).
- **El token público (`/api/public/evaluations/[token]`, `/evaluations/[token]`) se conserva sin cambios para evaluaciones SIN asignaciones de unidad de negocio** — no se rompe el flujo anónimo existente para organizaciones que no usan este feature. Una Evaluación con al menos una fila en `evaluation_assignment` se considera "modo corporativo" y usa exclusivamente el flujo autenticado; el link público deja de resolver para ella (mismo 404 genérico que un token revocado, para no filtrar cuál es el motivo).
- Invitar usuarios a una unidad de negocio reutiliza el flujo de `Invitation` ya existente (`organization-user.md`) — sin cambios, solo se invita al `Member` a la Organization que representa esa unidad de negocio.

## Aislamiento de progreso entre unidades — `response` particionada por unidad

Hoy `response` tiene grano `(evaluationId, subindicatorId)` — una sola fila compartida por TODA la Evaluación, sin importar quién responde. Con múltiples unidades de negocio respondiendo la MISMA Evaluación (mismo `evaluationId`), esto colisionaría: la respuesta de Supermercados Peruanos sobrescribiría la de Farmacias Peruanas en la misma fila.

- Añadir `businessUnitOrganizationId` a `response`, **`NOT NULL`** (FK → `organization.id`, cascade). Se descartó nullable: Postgres trata cada `NULL` de una columna en un unique constraint compuesto como NO-igual a cualquier otro `NULL` (semántica estándar, no una particularidad de este proyecto) — con `businessUnitOrganizationId` nullable, dos filas con el mismo `(evaluationId, subindicatorId)` y ambas `NULL` en esa columna NO violarían el unique constraint, permitiendo silenciosamente filas duplicadas para evaluaciones sin unidades de negocio — justo el invariante que se quería preservar. En vez de eso, toda Evaluación tiene SIEMPRE un valor real: `evaluation.organizationId` (la propia organización dueña) cuando no hay unidades de negocio involucradas, o la unidad de negocio real cuando sí las hay. Con un valor no-nulo siempre presente, la igualdad estándar de Postgres deduplica correctamente en ambos casos sin casos especiales.
- Cambiar el unique constraint de `(evaluationId, subindicatorId)` a `(evaluationId, subindicatorId, businessUnitOrganizationId)`.
- Al guardar una respuesta autenticada desde una unidad de negocio, `businessUnitOrganizationId = session.activeOrganizationId`. El servicio de persistencia (`response-service.ts`) valida que esa organización tenga una `evaluation_assignment` vigente para la Evaluación antes de aceptar el guardado (evita que alguien con sesión en una unidad no asignada escriba respuestas igual) — esta validación vive en el endpoint autenticado nuevo (ver "Acceso del evaluado"), no en `upsertResponse` en sí, que sigue siendo agnóstico de sesión (mismo criterio que hoy: la Respuesta se ata a la Evaluación, no a una identidad). El flujo público existente (sin unidades de negocio) sigue llamando a `upsertResponse` sin indicar unidad — el service la completa automáticamente con `evaluation.organizationId`.
- Lectura de progreso ("qué usuarios están completando", reinterpretado por el usuario como progreso POR UNIDAD, no por persona — se descartó explícitamente el tracking por individuo): se calcula agregando `response` filtrado por `(evaluationId, businessUnitOrganizationId)` — cuántos Subindicadores (de los que aplican a esa unidad tras exclusiones) tienen fila vs. el total asignado. Mismo cálculo que ya hace VS-027 (estado agregado por nodo del árbol), extendido con el filtro de unidad.
- Un usuario de una unidad JAMÁS ve progreso de otra: toda query de progreso desde Runtime pasa `session.activeOrganizationId` como filtro obligatorio — mismo patrón invariante que `organizationId` en el resto del dominio (`organization-user.md`, sección Tenant-scoping).
- **Excepción explícita para el corporativo**: la organización matriz (dueña de la Evaluación, `evaluation.organizationId`) puede leer el progreso de TODAS las unidades asignadas sin el filtro de unidad — es la única organización con permiso de lectura cross-unidad, validado comparando `evaluation.organizationId === session.activeOrganizationId` (no `businessUnitOrganizationId`).

## Plazo de recepción (`dueDate`) y comportamiento del banner

Nuevos campos en `evaluation`: `dueDate` (timestamp, nullable — sin plazo por defecto, mismo espíritu que "Fuera de alcance: expiración por fecha" de `publishing.md`, ahora sí pedido explícitamente por el usuario para el modo corporativo) y `contactEmail` (text, nullable — a qué correo escribir para pedir extensión, editable por el admin en el panel Publicar).

Comportamiento confirmado por el usuario (verbatim, ver historial de la conversación):

- El evaluado SIEMPRE puede abrir/ver la evaluación, incluso vencido el plazo.
- Pasado `dueDate`, ya NO puede registrar ni editar respuestas — hasta que el admin extienda `dueDate` o quite el plazo (marcándolo como "ya no completable", ver abajo).
- 2-3 días antes de `dueDate`: banner informativo "el plazo está por vencer".
- Después de `dueDate`: el banner cambia a "la evaluación ha finalizado", con mensaje invitando a contactar al administrador, mostrando `contactEmail`.

Reglas derivadas (corregidas tras aclaración explícita del usuario: **el formulario nunca debe quedar sin fecha límite una vez que se cumplió el plazo** — no existe una acción de "quitar el plazo"; la única forma de reabrir la escritura es que el admin fije una nueva fecha futura):

- `dueDate = null` → solo antes de que el admin fije un plazo por primera vez (sin plazo, sin banner, sin bloqueo — comportamiento actual, sin cambios). No es un estado al que se pueda volver después de haber tenido un `dueDate` — el campo, una vez fijado, solo se actualiza a fechas futuras (ver "Extender" abajo), nunca se limpia de vuelta a `null`. El service de actualización de Evaluación rechaza (400) cualquier intento de setear `dueDate = null` si ya tenía un valor.
- Banner de aviso: `dueDate` existe y `now >= dueDate - 3 días` y `now < dueDate`.
- Banner de cierre + bloqueo de escritura: `dueDate` existe y `now >= dueDate`. Muestra `contactEmail` para que el evaluado pida la extensión. La API de guardado de respuesta (`response-service.ts`) rechaza escrituras (403) en este estado — el bloqueo es de servidor, no solo de UI, mismo criterio que el resto de validaciones de negocio del proyecto. Este es el estado de reposo natural de "ya no es posible seguir completándolo": no requiere una acción explícita separada del admin, es simplemente lo que pasa cuando el plazo vence y nadie lo extiende.
- Extender el plazo: el admin edita `dueDate` a una fecha futura desde el panel Publicar — vuelve a habilitar escritura inmediatamente (no hay estado intermedio que recordar, se deriva todo de comparar `now` contra `dueDate` en cada request). Es la ÚNICA acción administrativa sobre `dueDate` una vez fijado.
- Este comportamiento de `dueDate`/banner aplica también a evaluaciones SIN unidades de negocio (uso general), no es exclusivo del modo corporativo — es ortogonal a la feature de unidades de negocio, aunque se documenta en este archivo porque surgió en el mismo pedido. Considerar si amerita su propia sección en `engines/publishing.md` en vez de vivir aquí (nota para cuando se revise este doc).

## Exportación consolidada (corporativo)

Hoy el export (`apps/web/app/api/evaluations/[id]/export/route.ts`) genera un único CSV plano por Evaluación. CSV no soporta pestañas — el pedido del usuario ("un Excel con pestaña consolidada + una pestaña por unidad de negocio") requiere un formato real de libro de Excel.

**Nueva dependencia: `exceljs`** (confirmado con el usuario) para generación de `.xlsx` con soporte multi-hoja. No hay ADR previa que la contemple porque el export actual (CSV) nunca la necesitó.

Diseño del archivo (solo para Evaluaciones en modo corporativo, es decir con `evaluation_assignment`; el CSV actual se mantiene sin cambios para evaluaciones sin unidades de negocio):

- Pestaña "Consolidado": misma estructura de columnas que el CSV actual (`Dimensión/Indicador/Subindicador/Número/Elemento/Tipo/Respuesta/Estado/Comentario confidencial`) más una columna `Unidad de negocio`, una fila por `(unidad, elemento respondido)` — permite pivotear/filtrar en Excel.
- Una pestaña por unidad de negocio asignada, con el mismo formato de columnas que el CSV actual (sin la columna `Unidad de negocio`, redundante dentro de su propia pestaña), respetando las exclusiones de esa unidad (nunca se listan Subindicadores excluidos, ni siquiera como "sin respuesta").
- Solo la organización matriz puede pedir este export (mismo criterio de excepción cross-unidad que la lectura de progreso, arriba).

## Dashboard de avance corporativo

Nueva vista en el Builder/panel Publicar (solo visible si `session.activeOrganizationId === evaluation.organizationId`, es decir la matriz), listando cada unidad de negocio asignada con: nombre, cantidad de Subindicadores aplicables (total − excluidos), cantidad respondidos, porcentaje, y si está vencido el plazo. Reutiliza el mismo cálculo de progreso agregado descrito arriba en "Aislamiento de progreso", sin filtrar por unidad (la matriz ve todas).

## Panel "Publicar" dentro del Builder — reemplaza la pantalla `/frameworks/[frameworkId]`

Confirmado con el usuario ("Borrarla por completo"): se elimina `apps/web/app/frameworks/[frameworkId]/page.tsx`. Su única función que sobrevive (Publicación) se relocaliza como un panel dentro de `apps/web/app/frameworks/[frameworkId]/builder/page.tsx`, junto al botón existente "Ver como evaluado".

**Estado (implementado)**: botón "Publicar" en la cabecera del builder-panel (`.builder-panel__head`) → drawer CSS (`publish-panel.tsx`, mismo patrón `.form-preview-drawer`). `frameworks/[frameworkId]/page.tsx` eliminada. Verificado en producción (deploy `f2acd7c`).

- Nuevo botón "Publicar" en la barra superior del Builder → abre un panel (modal o drawer, a decidir en implementación) con:
  - Generar evaluación (si no existe una para este Framework, o listar las existentes con opción de crear otra — mismo comportamiento que hoy). ✅
  - Enlace público (`/evaluations/{token}`) para copiar — solo se muestra/aplica si la Evaluación NO tiene asignaciones de unidad de negocio (modo simple, comportamiento actual sin cambios). ✅ (en modo corporativo muestra el enlace autenticado `/evaluations/authenticated/{id}`)
  - Campo `dueDate` editable (fecha límite) + campo `contactEmail` editable. ✅ (PATCH `/api/evaluations/[id]`)
  - Sección "Unidades de negocio" (solo si la organización actual tiene hijas): checklist para asignar/desasignar unidades a esta Evaluación — ✅ (vía `GET /api/organizations/children` + `GET/POST /api/evaluations/[id]/assignments` + `DELETE`); progreso por unidad (pills de porcentaje + "Plazo vencido") — 🔧 EN PROGRESO (VS-055, sin commitear: `getBusinessUnitProgress` + `GET /api/evaluations/[id]/progress`); por cada unidad asignada, un editor para marcar qué Subindicadores excluir (árbol igual al del Builder, con checkbox por nodo) — ⏳ diferido (backend ya existe desde VS-050)
  - Botón Exportar: CSV (comportamiento actual) si no hay unidades de negocio asignadas — ✅; XLSX consolidado (arriba) si las hay — ✅ completado en VS-055 (commit `3ae783f`)
  - Lista de evaluaciones publicadas de este Framework con Revocar por cada una — ✅ movido de la pantalla eliminada
- `apps/web/app/frameworks/page.tsx` ya enlaza directo a `/builder` desde VS-049 — no requiere cambios adicionales.

## Fuera de alcance (explícito)

- Jerarquía de más de un nivel (matriz de matrices).
- UI del editor de exclusiones (backend de granularidad `FormElement` individual ya implementado en VS-050/VS-053 — ver "Filtrado de preguntas" arriba; falta la interfaz en el panel Publicar, diferida a VS-055).
- Notificación por email de vencimiento próximo o invitación (sigue sin proveedor de email decidido, `organization-user.md`).
- Tracking de progreso por usuario individual — descartado explícitamente por el usuario; el eje de agregación es la unidad de negocio, no la persona.
- Reasignar una `Response` ya guardada de una unidad a otra (no hay caso de uso planteado).

## Testing (implementado VS-050 → VS-055)

- `packages/db`: tenant-scoping cruzado (unidad A no puede leer/escribir progreso ni respuestas de unidad B) ✅; exclusiones de Subindicador/elemento se respetan en el snapshot filtrado ✅; unique constraint compuesto de `response` acepta múltiples unidades para el mismo `(evaluationId, subindicatorId)` pero rechaza duplicado dentro de la misma unidad ✅; bloqueo de escritura tras `dueDate` ✅ (10 tests VS-052 + 2 cross-tenant VS-053 + 5 partición VS-051 + 7 assignments VS-050 + 9 acceso/exclusiones VS-053 + 2 progreso VS-055); export XLSX genera una pestaña por unidad más consolidado ✅ (VS-055, commit `3ae783f` — verificación manual, no automatizada).
- Verificación manual en producción: flujo completo con una organización matriz + 2 unidades de negocio, cada una con exclusiones distintas, confirmando aislamiento visual y de datos entre unidades, y que la matriz sí ve todo — ✅ parcial (VS-054 verificado end-to-end en producción: aislamiento de respuestas por unidad, bloqueo del link público en modo corporativo, 404 genérico para no-asignadas; falta verificar en producción el export XLSX y el dashboard de progreso).
