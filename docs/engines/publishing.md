# Motor: `engine/publishing` (v1 — M6/VS-009)

Publicación, versionado y enlaces seguros (`../architecture/overview.md`; `../SCOPE.md` F3: "Publicación de evaluaciones + enlaces seguros por invitación"). Responsabilidad de este motor: convertir un Framework (editable, mutable) en una **Evaluación** — una instancia publicada, inmutable, accesible mediante un enlace seguro sin necesidad de cuenta.

## Qué resuelve y qué no (límite con M7)

`M7/VS-010 — Runtime de respuesta + guardar progreso` es quien construye el formulario **interactivo** (capturar respuestas, autosave de progreso del evaluado). Este slice (M6) construye únicamente la parte de **publicación y acceso**: crear la Evaluación, generar y revocar el enlace, y una página pública que **muestra** el contenido publicado de forma legible — sin campos de respuesta todavía. Es la misma relación que hubo entre VS-004 (schema+API) y VS-006 (Builder UI): una capa se construye completa y verificable antes de que la siguiente la consuma.

## Decisión central: snapshot completo, no solo un puntero a `revisionNumber`

`../domain/ubiquitous-language.md` y `../domain/evaluation-hierarchy.md` documentan que "publicar una Evaluación apunta a una revisión concreta" de cada `formSchema`. Pero el schema actual (VS-004/VS-007) **no guarda historial** — cada `UPDATE` de `formSchema` sobrescribe la fila y solo incrementa el contador `revisionNumber`; no existe una tabla de versiones de la que recuperar "cómo era el contenido en la revisión 3". Construir esa tabla de historial general es una pieza mayor, no pedida explícitamente en ningún milestone del roadmap.

**Decisión v1:** en vez de un puntero `{subindicatorId: revisionNumber}` que requeriría esa tabla de historial para ser útil, `Evaluación` guarda una **copia completa (snapshot)** de todo el árbol —nombres de Framework/Dimensión/Indicador/Subindicador y el `formSchema`+`revisionNumber` de cada Subindicador— tomada en el momento de publicar. Esto cumple la invariante de inmutabilidad (la Evaluación nunca cambia aunque se seguya editando el Framework original) sin requerir cambios en la capa de persistencia de VS-004/VS-007. Consecuencia aceptada: si se necesita en el futuro reconstruir "qué revisión exacta tenía tal Subindicador en tal fecha" fuera del contexto de una publicación, hará falta una tabla de historial real — no está pedido hoy.

## Alcance v1

- Nueva entidad `Evaluation` (tabla `evaluation`, `packages/db/src/schema/evaluation.ts`): `id`, `organizationId` (tenant-scoping, invariante ya establecida en `organization-user.md`), `frameworkId` (referencia, cascade delete — ver "Fuera de alcance"), `token` (único, aleatorio, es la credencial de acceso), `title` (copiado del Framework al publicar), `snapshot` (jsonb, ver estructura abajo), `publishedAt`, `createdAt`.
- Publicar: acción autenticada (member/owner de la organización) que recorre el árbol completo del Framework y construye el snapshot.
- Revocar: borrar la fila de `Evaluation` — el token deja de resolver inmediatamente. Sin campo `revokedAt` separado ni soft-delete: mismo patrón CRUD que el resto del dominio (borrar es revocar), no se inventa un concepto nuevo sin necesidad.
- Reemplaza al patrón de "link sin email" ya usado en invitaciones (`organization-user.md`, línea 30, lo anticipa explícitamente): el admin copia el link generado y lo comparte manualmente. Ningún proveedor de email está decidido (mismo motivo que VS-003).
- Se puede publicar el mismo Framework más de una vez: cada publicación crea una Evaluación nueva e independiente (token propio), sin invalidar publicaciones previas. Republicar no es "actualizar" una Evaluación existente.
- Página pública de solo lectura (`/evaluations/[token]`) sin autenticación: muestra el árbol completo del snapshot (títulos + elementos de cada formulario) en modo lectura. No hay inputs de respuesta — eso es M7.

## Fuera de alcance (explícito)

- **Captura de respuestas** (`engine/persistence`, M7/M8) — la página pública de este slice es de solo lectura.
- **Tabla de historial de revisiones** de `formSchema` — ver "Decisión central" arriba. El snapshot resuelve la inmutabilidad sin necesitarla.
- **Expiración por fecha o límite de usos** del enlace — "seguro" en v1 significa token aleatorio de alta entropía + revocación manual; expiración automática no está pedida por `../SCOPE.md`/`../VISION.md` y se puede añadir después sin romper el modelo (sería una columna adicional).
- **RBAC granular** sobre quién puede publicar/revocar — cualquier `member`/`owner` de la organización puede, igual que el resto del dominio hasta M11 (`engine/permission`, ya documentado como límite en `organization-user.md`).
- **Congelar título/descripción de Dimensión/Indicador de forma distinta al contenido del formulario** — no aplica: al ser un snapshot completo, *todo* queda congelado por igual, no solo `formSchema`. Esto es más simple de razonar que congelar unos campos sí y otros no.
- Si se borra el Framework original, sus Evaluaciones publicadas se borran en cascada (mismo patrón de `organizationId`/cascade ya usado en todo el dominio). Se acepta como simplificación v1 — no hay todavía respuestas de evaluados en juego (M7 no existe aún) que se perderían con esto.

## Estructura del snapshot

```ts
interface EvaluationSnapshot {
  frameworkName: string;
  frameworkDescription: string | null;
  dimensions: Array<{
    id: string; title: string; description: string | null;
    indicators: Array<{
      id: string; title: string; description: string | null;
      subindicators: Array<{
        id: string; title: string; description: string | null;
        formSchema: FormSchema | null; // ver docs/engines/form.md
        revisionNumber: number;
      }>;
    }>;
  }>;
}
```

## Contratos (`packages/sdk-core`)

Nuevo archivo `packages/sdk-core/src/evaluation.ts`: `createEvaluationInput` (`{ frameworkId }`), `evaluationSnapshot` (zod, la estructura de arriba, reutiliza `formSchema` de `form-schema.ts`), interfaz `Evaluation` (entidad persistida). Exportado desde `index.ts`.

## Persistencia (`packages/db`)

- `createEvaluation(organizationId, { frameworkId })`: valida que el Framework pertenece a la organización (mismo patrón `NotFoundError` que el resto del dominio), recorre Dimensión→Indicador→Subindicador con las funciones `list*` ya existentes, arma el snapshot, genera `token` con `crypto.randomBytes(24).toString("base64url")` (192 bits de entropía — mismo orden de magnitud que un token de sesión), inserta y retorna la fila (incluye el token: es la única vez que el admin lo ve completo en la respuesta de creación, igual que un secret).
- `listEvaluations(organizationId, frameworkId)`, `deleteEvaluation(organizationId, id)`: CRUD tenant-scoped estándar.
- `getEvaluationByToken(token)`: **sin parámetro `organizationId`** — es la única función de todo el dominio que no filtra por organización, a propósito: la seguridad de este lookup depende exclusivamente de que `token` sea impredecible, no de una sesión. Devuelve `null` tanto si el token nunca existió como si fue revocado (no se distingue, evita filtrar información sobre qué tokens existieron).

## API (`apps/web`)

- `POST /api/evaluations` (autenticado): body `{ frameworkId }` → crea y retorna la Evaluación (con token).
- `GET /api/evaluations?frameworkId=...` (autenticado): lista para mostrar en el Builder.
- `DELETE /api/evaluations/[id]` (autenticado, tenant-scoped): revoca.
- `GET /api/public/evaluations/[token]` (**sin autenticación**, a propósito bajo el prefijo `public/` para que el límite sea visible en la estructura de carpetas y nadie le agregue `requireActiveMember` por reflejo): retorna el snapshot. 404 genérico si el token no resuelve.

## UI

- Página de Framework (`apps/web/app/frameworks/[frameworkId]/page.tsx`): botón "Publicar" → crea la Evaluación y muestra el link completo (`/evaluations/{token}`) para copiar. Lista de Evaluaciones ya publicadas de ese Framework con botón "Revocar" por cada una.
- Página pública nueva `apps/web/app/evaluations/[token]/page.tsx`: sin `app-header`/sesión, fetch directo a `/api/public/evaluations/[token]`, renderiza el árbol completo en modo lectura (título de Framework → Dimensiones → Indicadores → Subindicadores → lista de Elementos de cada uno, sin inputs). 404 legible si el token no resuelve.

## Testing

- `packages/sdk-core`: tests de `evaluationSnapshot` (zod).
- `packages/db`: test de integración contra Neon real — publicar genera un snapshot fiel al árbol actual; editar el Framework/Subindicador *después* de publicar no cambia la Evaluación ya creada (verifica la inmutabilidad, el punto central de este motor); `getEvaluationByToken` no requiere sesión y devuelve `null` tanto para un token inexistente como para uno de una Evaluación borrada.
- Verificación manual en navegador real **contra producción** (no local, mismo criterio que VS-008): publicar desde el Builder, abrir el link público en una pestaña sin sesión, confirmar que se ve el contenido, revocar, confirmar que el link deja de funcionar.
