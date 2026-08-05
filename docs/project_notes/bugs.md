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
