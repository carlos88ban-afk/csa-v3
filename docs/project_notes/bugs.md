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
