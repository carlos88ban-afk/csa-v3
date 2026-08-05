# Motor: `engine/evidences` (v1 — M8/VS-011)

Evidencias: archivos adjuntos a una Respuesta, almacenados en Cloudflare R2 (`../architecture/overview.md`; `../domain/ubiquitous-language.md`: **Evidencia** = "archivo adjunto a una Respuesta, almacenado en R2"). Responsabilidad de este motor: añadir el tipo de Elemento `evidencia` al formulario y el flujo completo de subida/descarga/borrado de archivos, sin pasar los binarios por el servidor Next.js.

## Qué resuelve y qué no (límites con otros motores)

Extiende `engine/persistence` (M7/VS-010) con un octavo tipo de Elemento que depende de almacenamiento de archivos — la razón por la que `form.md` y `components.md` v1 lo dejaron fuera. No es un motor nuevo de "gestión de documentos": el archivo es **parte de la Respuesta** (`answers[elementId]`), no una entidad de dominio independiente. Tampoco introduce validación de contenido de respuestas (eso sigue en el backlog, ver `persistence.md` "Fuera de alcance").

## Decisión central: presigned URLs de R2, los binarios nunca pasan por Vercel

Vercel Hobby limita el tamaño de request/response de las funciones serverless (~4.5MB). Una evaluación empresarial real (CSA, ESG, ISO) adjunta PDFs de decenas de MB. Por eso:

- **Subida**: `PUT` directo del navegador a R2 con una **presigned URL** generada por el servidor (validez 5 min). El servidor solo valida pertenencia y límites, nunca recibe el binario.
- **Descarga**: presigned GET generado on-demand cuando el evaluado pide el archivo (validez 5 min). Mismo motivo: el binario no pasa por la función serverless.
- **Borrado**: `DeleteObjectCommand` del servidor (el cuerpo de la petición es minúsculo, no aplica el límite).

Consecuencia aceptada: la URL firmada expone la ruta del objeto en R2 (el bucket no es público; la URL es intransferible por diseño y caduca en minutos). Alternativa descartada: proxy de streaming por el servidor — choca con el límite de 4.5MB de Vercel Hobby y duplica tráfico.

## Claves en R2 y validación de pertenencia

Cada objeto se guarda bajo la clave `evaluations/{evaluationId}/{uuid}` (el `evaluationId` real, no el token). Toda operación de evidencia (generar presigned URL, descargar, borrar) recibe una `key` y la rechaza si **no empieza por el prefijo de la Evaluación** (`evaluations/{evaluationId}/`). Esto impide IDOR por key: el token de una Evaluación no puede leer/borrar archivos de otra.

## Tipos de Elemento

Nuevo tipo `evidencia` (octavo, se suma a los 7 de `form.md` v1). Es un tipo **pregunta** (`isQuestion: true` — captura respuesta) con config propia:

| `type` | Uso | Config propia |
|---|---|---|
| `evidencia` | Pregunta de archivo adjunto (1+ archivos subidos a R2) | `maxFiles?: number` (default 5), `maxSizeMb?: number` (default 10), `acceptedTypes?: string[]` (extensiones o mime types; vacío/ausente = cualquiera) |

En `component-registry.ts` (única fuente de verdad, ver `components.md`): `{ type: "evidencia", label: "Evidencia", isQuestion: true, version: 1 }`.

## Contratos (`packages/sdk-core`)

**`form-schema.ts`** — nueva rama del discriminated union:

```ts
z.object({
  ...questionBase,
  type: z.literal("evidencia"),
  maxFiles: z.number().int().positive().optional(),
  maxSizeMb: z.number().positive().optional(),
  acceptedTypes: z.array(z.string().min(1)).optional(),
})
```

**`response.ts`** — el valor de un elemento `evidencia` es una lista de referencias a objetos ya subidos (no un string[] de keys: el Runtime necesita nombre/tamaño/tipo para renderizar sin pedir metadata a R2):

```ts
export const evidenceRef = z.object({
  key: z.string().min(1),
  name: z.string().min(1),      // nombre original del archivo
  size: z.number().nonnegative(), // bytes
  mimeType: z.string(),          // content type detectado por el navegador
});
export type EvidenceRef = z.infer<typeof evidenceRef>;

export const answerValue = z.union([z.string(), z.number(), z.array(z.string()), z.array(evidenceRef)]);
```

`answerValue` gana el cuarto caso sin romper los anteriores. La Respuesta persiste estas refs en `answers[elementId]` — sin tabla nueva en Postgres: el jsonb de `response` ya lo soporta tal cual (el servicio es agnóstico del contenido, ver `form.md`).

## Persistencia (`packages/db`)

Sin cambios de schema ni de servicio: `upsertResponse` ya guarda cualquier `answers` válida para zod. Único requisito nuevo: un test de integración que demuestre que una Respuesta con refs de evidencia persiste y se recupera intacta.

## Configuración (R2)

Env vars nuevas (`.env` local + Vercel, todas requeridas; sin ellas las rutas de evidencia responden 503):

- `R2_ACCOUNT_ID` — Account ID de Cloudflare (host del endpoint S3).
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — token de API S3 de R2 (Manage R2 API Tokens).
- `R2_BUCKET_NAME` — nombre del bucket (ej. `csa-v3-evidences`).

Endpoint del cliente S3: `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, region `auto`, `forcePathStyle: true`. Dependencias nuevas en `apps/web`: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (solo server-side, importadas únicamente en rutas API y `lib/r2.ts`, nunca en componentes cliente).

**CORS del bucket (requerido, se configuró manualmente en el dashboard de Cloudflare)**: sin política CORS, el `PUT` del navegador a la presigned URL falla con "Failed to fetch" (error de red opaco: R2 rechaza sin headers CORS). Regla aplicada en el bucket `plataforma-csa-files`:

```json
{
  "rules": [{
    "allowed": {
      "headers": ["*"],
      "methods": ["GET", "PUT", "DELETE", "HEAD"],
      "origins": ["https://csa-v3-web.vercel.app", "http://localhost:3000"]
    },
    "exposeHeaders": ["ETag", "Content-Length"],
    "id": "csa-browser",
    "maxAgeSeconds": 3600
  }]
}
```

(Puede aplicarse con `PUT https://api.cloudflare.com/client/v4/accounts/{account}/r2/buckets/{bucket}/cors` — body `{"rules":[...]}`. Cualquier origen nuevo que sirva el Runtime debe añadirse a `allowed.origins`.)

## API (`apps/web`)

Todas bajo el prefijo público, mismo criterio que `persistence.md` (el límite sin auth visible en la estructura de carpetas). El token resuelve la Evaluación (`getEvaluationByToken`, 404 si no existe); `subindicatorId`/`elementId` deben existir en el snapshot **y** el elemento debe ser de tipo `evidencia` (valida contra el snapshot congelado, no contra el Subindicador vivo — mismo principio que `response-service.ts`).

- `POST /api/public/evaluations/[token]/evidences/presign` — body `{ subindicatorId, elementId, fileName, contentType, size }` → valida límites del elemento (`maxFiles` no se puede validar aquí contra el estado local del navegador; `maxSizeMb` sí: 413 si `size > maxSizeMb`; `acceptedTypes` sí: 415 si el mime/extension no encaja) → genera `key = evaluations/{evaluationId}/{uuid}` → devuelve `{ key, uploadUrl }` (presigned PUT, 5 min).
- `POST /api/public/evaluations/[token]/evidences/download-url` — body `{ key }` → valida prefijo de la Evaluación → devuelve `{ url }` (presigned GET, 5 min). 404 si la key no existe en R2 (head object).
- `DELETE /api/public/evaluations/[token]/evidences` — body `{ key }` → valida prefijo → borra el objeto. Idempotente: borrar una key inexistente no es error.

El conteo de `maxFiles` se hace en cliente (la UI conoce el estado local de la Respuesta); el servidor valida límites de tamaño/tipo por archivo individual.

## UI (Runtime)

En `apps/web/app/evaluations/[token]/page.tsx`, el render de `evidencia` es un componente propio (mismo patrón que los otros tipos dentro de `ElementView`):

- `input type="file"` (multiple si `maxFiles > 1`, `accept` derivado de `acceptedTypes`) + botón "Subir".
- Al elegir archivos: validación local (tamaño ≤ `maxSizeMb`, tipo permitido, total ≤ `maxFiles`) → por cada archivo: `POST presign` → `PUT` directo a `uploadUrl` con el binario → añadir `evidenceRef` al valor del elemento. Mientras sube: indicador de progreso por archivo (estado local `uploading`); al terminar, la ref entra en `answers[elementId]` y el autosave existente (debounce 1500ms) la persiste.
- Lista de archivos ya subidos: nombre + tamaño formateado + botón "Descargar" (pide `download-url` y abre la URL firmada en otra pestaña / `window.open`) + botón "Quitar" (llama `DELETE` y quita la ref; el autosave persiste la lista sin ella).
- Progreso del Subindicador (ver `persistence.md`): `evidencia` cuenta como respondida si `answers[elementId]` tiene ≥ 1 ref. El punto del árbol y el % global lo reflejan automáticamente al ser `isQuestion`.

Nota de robustez: si el usuario cierra la pestaña entre el PUT a R2 y el autosave, queda un objeto huérfano en R2 (la ref nunca se guardó). Aceptado en v1 — se documenta en `../RISKS.md` R-003 (volumen) y no se construye limpieza programática todavía (deuda consciente, ver `../TECH_DEBT.md`).

## UI (Builder)

En `apps/web/.../subindicators/[subindicatorId]/page.tsx` (Form Editor):

- El selector "Agregar elemento" lo gana gratis (itera `componentRegistry`).
- `newElement("evidencia")` → `{ id, type, label: "", componentVersion }` (defaults de config aplicados en el Runtime si el campo está ausente: `maxFiles: 5`, `maxSizeMb: 10`).
- Config del elemento (como `seleccion_multiple` hoy): inputs para `maxFiles` (número), `maxSizeMb` (número) y `acceptedTypes` (texto separado por comas → array; vacío = sin restricción).

## Testing

- `packages/sdk-core`: tests de la rama `evidencia` en `formElement` (config válida/inválida), de `evidenceRef` y del nuevo caso de `answerValue` (array de refs válido; array de strings no debe parsear como refs — discrimina por zod union).
- `packages/db`: test de integración contra Neon real — `upsertResponse` con `answers` que incluyen refs de evidencia persiste y `listResponses` las devuelve intactas (sin cambios de schema, pero la invariante queda documentada por test).
- Verificación manual **contra producción** (no local, mismo criterio que VS-008/VS-009/VS-010): publicar un Framework con un elemento `evidencia`, abrir el link público sin sesión, subir un archivo real (PDF/imagen), confirmar que aparece en la lista, recargar (persiste vía autosave), descargar (el archivo baja íntegro), quitar (desaparece y el objeto se borra de R2), confirmar con `curl` sin cookies que un `subindicatorId`/key de otra Evaluación da 404, y que `presign` con un elemento no-`evidencia` da 400. Datos de prueba limpiados al final.
