# Motor: `engine/export` (v1 — M9/VS-012)

Exportación de resultados (`../architecture/overview.md`; `../OBJECTIVES.md` F5: "Exportación de resultados"). Responsabilidad de este motor: dejar que un miembro de la Organización descargue en un archivo las Respuestas capturadas por una Evaluación publicada — el cierre de lectura del ciclo Builder → Publicar → Responder (`engine/persistence`) → **Exportar**.

## Decisión central: CSV plano, no Excel/PDF

`../SCOPE.md` es explícito: "Exportación de resultados" (dentro de alcance) vs. "Analítica avanzada / BI sobre resultados — solo exportación básica" (fuera de alcance). CSV es la exportación "básica" por definición: se abre nativamente en Excel/Sheets/Numbers, no requiere una librería nueva (a diferencia de generar `.xlsx` real con `exceljs` o un PDF con `pdfkit`), y no introduce una dependencia que haya que justificar (NFR-3). No se construye un motor de reportes con gráficos ni agregaciones — eso es BI, explícitamente fuera de alcance.

## Alcance v1

- Una fila por **Elemento tipo pregunta** (`isQuestion: true` en `component-registry.ts`) de cada Subindicador del snapshot de la Evaluación, con columnas: `Dimensión`, `Indicador`, `Subindicador`, `Elemento`, `Tipo`, `Respuesta`.
- Si el Subindicador no tiene Respuesta guardada todavía, la columna `Respuesta` queda vacía — el CSV siempre refleja la cobertura completa del formulario (todas las preguntas), no solo lo respondido, mismo criterio que el cálculo de progreso de `persistence.md`.
- Formato de `Respuesta` por tipo: `texto_corto`/`texto_largo`/`numero` tal cual; `seleccion_unica` resuelve el `id` de la opción elegida a su `label` (`options` del propio elemento, ya viene en el snapshot); `seleccion_multiple` igual, opciones unidas con `"; "`; `evidencia` lista los `name` de los archivos adjuntos unidos con `"; "` (el binario no viaja en el CSV — se descarga aparte con el link ya existente de `evidences.md`, el CSV es para revisar contenido, no para respaldo de archivos); `url_publica` (VS-017) une las URLs literales con `"; "`, sin resolver nada (no hay `label` que resolver, son referencias externas).
- CSV en **UTF-8 con BOM** (`﻿` al inicio) — sin el BOM, Excel en Windows interpreta tildes/ñ como caracteres corruptos; es el gotcha más común de exportar CSV con texto en español.
- Escapado RFC 4180 estándar (comillas dobles alrededor de cualquier valor que contenga coma, comilla o salto de línea; comillas internas duplicadas) — sin librería, es una función de ~10 líneas.

## Quién puede exportar

Cualquier `member`/`owner` de la Organización dueña del Framework — **autenticado**, mismo criterio de tenant-scoping que el resto del Builder (`requireActiveMember`). A diferencia de `persistence.md`/`evidences.md`, esta ruta **no vive bajo `public/`**: exportar es una acción de revisión del administrador sobre datos de su propia Organización, no algo que el evaluado (sin cuenta, solo con el token) necesite o deba poder hacer.

## Fuera de alcance (explícito)

- **XLSX real / PDF** — ver "Decisión central". Si se pide en el futuro, es una capa de formato sobre las mismas filas, no un rediseño.
- **Envío del export por email** — no hay proveedor de email decidido (mismo motivo documentado en `organization-user.md`); el archivo se descarga directo en el navegador.
- **Exportación agregada de múltiples Evaluaciones en un solo archivo** — cada Evaluación (cada publicación) exporta su propio CSV; no está pedido comparar publicaciones distintas todavía.
- **Analítica / BI (agregaciones, gráficos, scoring)** — `../SCOPE.md` lo excluye explícitamente. Un "puntaje" calculado además depende de `engine/formula` (M10), que no existe todavía.
- **Exportación desde la vista del evaluado (ruta pública)** — ver "Quién puede exportar".

## Contratos (`packages/sdk-core`)

Ninguno nuevo. La ruta no recibe más input que el `id` de la URL y responde texto plano (`text/csv`), no JSON — no hay forma nueva que valga la pena tipar con zod en `sdk-core` (mismo criterio que "no se agrega abstracción sin necesidad").

## Persistencia (`packages/db`)

- `getEvaluation(organizationId, id)` (nuevo en `evaluation-service.ts`): lookup tenant-scoped de una Evaluación por id, mismo patrón que `getFramework`. Hoy `evaluation-service.ts` solo tiene `listEvaluations` (por `frameworkId`) y `getEvaluationByToken` (sin `organizationId`, para la ruta pública) — faltaba el lookup individual autenticado que esta ruta necesita.
- Reutiliza `listResponses(evaluationId)`, ya existente desde `persistence.md` — sin funciones nuevas de lectura de Respuestas.

## API (`apps/web`)

- `GET /api/evaluations/[id]/export` (autenticado, tenant-scoped): resuelve la Evaluación con `getEvaluation`, arma las filas recorriendo `snapshot.dimensions → indicators → subindicators → formSchema.elements` (filtrando `isQuestion`), cruza con `listResponses` para los valores, serializa a CSV. Responde `Content-Type: text/csv; charset=utf-8` y `Content-Disposition: attachment; filename="{título-sanitizado}.csv"`. 404 si la Evaluación no existe o no pertenece a la Organización activa (mismo patrón `NotFoundError` del resto del dominio).

## UI

- Página de Framework (`apps/web/app/frameworks/[frameworkId]/page.tsx`): cada fila de la lista de Evaluaciones publicadas gana un link "Exportar CSV" junto a "Revocar", apuntando directo a `/api/evaluations/{id}/export` — descarga nativa del navegador vía `<a href>`, sin necesitar `fetch`/manejo de blobs en cliente (más simple, y funciona igual si el usuario copia el link).

## Testing

- `packages/db`: test de integración contra Neon real — `getEvaluation` es tenant-scoped (devuelve `null` para una Evaluación de otra Organización, igual que `getFramework`).
- Sin test automatizado de la ruta CSV en sí — `apps/web` no tiene test runner de rutas todavía (mismo criterio ya aceptado en el resto de rutas API de este proyecto: verificación manual en navegador real).
- Verificación manual **contra producción**: publicar una Evaluación, responder preguntas de varios tipos (incluida `evidencia` con al menos un archivo), exportar el CSV desde la página de Framework, abrir el archivo y confirmar que las filas/columnas son correctas, que `seleccion_unica`/`multiple` muestran labels (no ids), que las tildes se ven bien, y que una Evaluación de otra Organización no es exportable (404) probando el endpoint con `curl` y una sesión de otra cuenta o sin sesión.
