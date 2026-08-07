# Bug Log

Registro cronológico de bugs y su solución. Entradas breves. Limpiar entradas muy antiguas (6+ meses) cuando dejen de ser relevantes.

## Formato

```
### YYYY-MM-DD - Descripción breve
- **Issue**: qué falló
- **Root Cause**: por qué pasó
- **Solution**: cómo se arregló
- **Prevention**: cómo evitarlo (opcional)
```

### 2026-08-07 - Editor WYSIWYG (VS-030) pierde el foco justo después de ganarlo
- **Issue**: Al reemplazar el `<textarea>` del comentario confidencial por un editor TipTap (`contentEditable`), un click dentro del editor lo enfocaba correctamente por un instante (confirmado con `document.activeElement`) pero perdía el foco de inmediato — el texto tecleado terminaba en el `<input>` principal de la pregunta ("Nombre del responsable"), no en el editor. Reproducido de forma inconsistente en local (Playwright/`next dev`) antes de aislarse; confirmado y corregido probando contra producción real.
- **Root Cause**: `NaCommentRow` vivía dentro del mismo `<label className="field runtime-question">` que el input principal de la pregunta (texto_corto/texto_largo/número/seleccion_desplegable). Un `<label>` redirige el foco/activación a su control asociado ante *cualquier* click dentro de él — comportamiento nativo del navegador (HTML Living Standard), no un bug de React — salvo que el elemento clickeado ya sea él mismo un control de formulario nativo que intercepta su propio click (`input`/`textarea`/`select`/`button`). El `<textarea>` anterior (VS-028) nunca mostró el problema porque, siendo un control nativo, quedaba exento de esa redirección; un `contentEditable` no lo es.
- **Solution**: Restructurados los 4 tipos de elemento afectados (`texto_corto`, `texto_largo`, `numero`, `seleccion_desplegable` en `apps/web/app/evaluations/[token]/page.tsx`): el `<label>` ahora envuelve *solo* su propio control (label + input); `naCommentRow`/`statusRow` quedan como hermanos fuera de él, dentro de un `<div className="field runtime-question">` que conserva el mismo estilo. De paso resuelve la ambigüedad de accesibilidad preexistente (el input principal y el comentario compartían accessible name vía el `<label>` compartido).
- **Prevention**: Cualquier elemento interactivo no-nativo (`contentEditable`, componentes custom con `tabIndex`) que se agregue dentro de un `<label>`/`<fieldset>` existente debe verificarse contra este comportamiento — un `<label>` nunca debe envolver más de un control real. Si aparece de nuevo, sospechar primero del wrapper antes de asumir un bug de event handling en React.

### 2026-08-06 - Guardar respuesta en un Subindicador directo (VS-029) falla con `subindicator_NOT_FOUND`
- **Issue**: Al implementar subindicadores directos bajo Dimensión (sin Indicador intermedio), guardar una respuesta del evaluado en uno de ellos fallaba con `Error al guardar: subindicator_NOT_FOUND`, reproducido a mano en producción.
- **Root Cause**: `snapshotHasSubindicator` (`packages/db/src/domain/response-service.ts`) y `findSnapshotSubindicator` (`apps/web/lib/evidence-validation.ts`) recorren el snapshot buscando el Subindicador solo dentro de `dim.indicators[].subindicators` — ninguna de las dos miraba `dim.subindicators` (los directos, agregados en VS-029). Dos funciones con la misma búsqueda duplicada, ambas con el mismo gap.
- **Solution**: Ambas funciones ahora también revisan `dim.subindicators`. Cubierto con un test de integración nuevo contra Neon real (`packages/db/src/__tests__/response.test.ts`).
- **Prevention**: Cualquier función que recorra `EvaluationSnapshot` buscando un Subindicador por id debe considerar ambos orígenes (`indicator.subindicators` y `dimension.subindicators`) desde VS-029 en adelante — grep por `.subindicators.find(` / `.subindicators.some(` antes de dar por cerrada una feature que toque el snapshot.

### 2026-08-04 - Build de Vercel falla con "DATABASE_URL is not set" pese a estar configurada en el proyecto
- **Issue**: Al desplegar `apps/web` en Vercel (primer despliegue, adelantado antes de VS-009), `turbo run build` falla en `/api/dimensions/[id]` con `DATABASE_URL is not set`, aunque la variable sí estaba puesta en Settings → Environment Variables de Vercel.
- **Root Cause**: Turborepo 2.x sólo pasa a cada task las variables de entorno declaradas explícitamente en `turbo.json` (`env`/`globalEnv`); el resto se bloquea aunque existan en el entorno del build, aun cuando la app las usa correctamente en local (ahí `dotenv-cli` las carga directo del `.env`, sin pasar por Turbo). El propio log de Vercel lo advierte como `WARNING`, no como error, así que es fácil pasarlo por alto.
- **Solution**: Añadir `"globalEnv": ["DATABASE_URL", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET"]` a `turbo.json`. Verificado con `pnpm build` local.
- **Prevention**: Cualquier variable de entorno nueva que use `packages/db` o `apps/web` debe agregarse a `globalEnv` en `turbo.json` en el mismo commit que la introduce, no sólo a `.env`/Vercel.

### 2026-08-04 - Signup en producción devuelve 403 en `/api/auth/sign-up/email`
- **Issue**: Con el build ya corriendo en Vercel, crear una cuenta nueva desde `https://csa-v3-web.vercel.app` fallaba con `403 Forbidden` en `POST /api/auth/sign-up/email`.
- **Root Cause**: `BETTER_AUTH_URL` en las env vars de producción de Vercel no coincidía exactamente con el origin real (`https://csa-v3-web.vercel.app`, dominio asignado tras el primer deploy). Better Auth valida el header `Origin` de cada request contra `baseURL`/`trustedOrigins` en su middleware `origin-check` y responde `403 INVALID_ORIGIN` si no calza — confirmado leyendo `better-auth/dist/api/middlewares/origin-check.mjs`.
- **Solution**: `vercel env rm BETTER_AUTH_URL production` + `vercel env add` con el valor exacto `https://csa-v3-web.vercel.app` (sin slash final), luego redeploy. Verificado con `curl -X POST .../sign-up/email -H "Origin: https://csa-v3-web.vercel.app"` → `200`.
- **Prevention**: Al fijar `BETTER_AUTH_URL` en cualquier entorno nuevo, usar el dominio final exacto (sin trailing slash) antes del primer signup, no un placeholder. Si el dominio de Vercel cambia (alias custom, etc.), actualizar esta env var en el mismo cambio.

### 2026-08-04 - `vercel deploy` local sube cientos de MB y falla ("fetch failed" / "File size limit exceeded")
- **Issue**: Al desplegar por CLI (`vercel deploy --prod`) desde la raíz del monorepo, la subida llegó a ~400MB y falló (primero con `fetch failed` a mitad de subida, luego con `File size limit exceeded (100 MB)` en un reintento).
- **Root Cause**: Un `pnpm build` local previo había generado `apps/web/.next` (~426MB, incluye cache y trazas). Aunque `.next/` está en `.gitignore`, el CLI de Vercel igual lo incluyó en el paquete subido.
- **Solution**: Borrar `apps/web/.next` y las carpetas `.turbo` locales antes de `vercel deploy` (`rm -rf apps/web/.next .turbo apps/web/.turbo packages/*/.turbo`). Con eso la subida bajó a ~600KB y el deploy fue exitoso.
- **Prevention**: No correr `vercel deploy` local sin limpiar `.next`/`.turbo` primero, o preferir el trigger automático vía integración Git (push a `main`) cuando esté disponible en vez del CLI local.
