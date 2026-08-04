# Key Facts

Constantes y configuración del proyecto. **Nunca guardar contraseñas, API keys ni credenciales aquí** — van en `.env` (excluido por `.gitignore`) o en el gestor de secretos que se adopte.

## Producto

- Nombre: Plataforma CSA — Constructor de Evaluaciones Empresariales.
- Uso: interno / no comercial (confirmado 2026-08-04). Si esto cambia, revisar `docs/VISION.md`, `docs/SCOPE.md` y `docs/adr/0001-hosting-nextjs-vercel-hobby.md` antes de continuar.
- Escala objetivo: ~20 usuarios concurrentes (NFR-1, `docs/architecture/requirements.md`).

## Stack (cerrado 2026-08-04 — detalle y justificación en `docs/adr/`)

- App / hosting: Next.js + Vercel (plan Hobby).
- Base de datos: Neon (Postgres serverless) + Drizzle ORM.
- Almacenamiento de archivos: Cloudflare R2 (S3-compatible).
- Auth: Better Auth (self-hosted, mismas tablas Postgres).
- Tests: Vitest (unit) + Playwright (e2e).
- Tooling: pnpm workspaces + Turborepo + TypeScript strict.

## Límites de free tier a monitorear

- **Neon**: 100 CU-hours/mes, 0.5GB storage. Al superarlo → proyecto suspendido hasta el siguiente ciclo de facturación. Ver `docs/RISKS.md` R-001.
- **Vercel Hobby**: prohíbe uso comercial en su ToS. Válido solo mientras el proyecto sea uso interno. Ver `docs/RISKS.md` R-002.
- **Cloudflare R2**: 10GB gratis perpetuos; estimado real de uso ~15GB → ~$0.08–0.15/mes de excedente. Egress siempre gratuito. Ver `docs/RISKS.md` R-003.

## Estructura del monorepo

- `packages/sdk-core` — contratos TypeScript compartidos (único paquete existente a 2026-08-04).
- `apps/` — aún sin aplicaciones (Next.js se añade en un slice futuro, no antes de VS-003).
- Comando de verificación de cierre de slice: `pnpm build && pnpm test && pnpm typecheck` (alias `pnpm slice:close`).

## Puertos de desarrollo local

- Aún no aplica (no hay servidor de desarrollo hasta que exista `apps/web`).

## URLs importantes

- Ninguna aún (repositorio remoto, dashboard de Vercel/Neon/R2 se añaden cuando se provisionen en un slice futuro).
