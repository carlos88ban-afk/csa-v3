checkpoint: c9e1a1b0-0002-4a2b-8c3d-000000000002
fecha: 2026-08-04
estado: en_progreso
slice_actual: VS-004

slices_completados: [VS-001, VS-002, VS-003]

decisiones_del_dia:
  - VS-003 implementado directamente (no vía OpenCode): dos intentos de delegar a OpenCode fallaron (503 de cola gratuita saturada, luego proceso colgado con Gemini 2.5 Pro) sin escribir nada — se mataron los procesos huérfanos y se implementó a mano.
  - Auth: plugin `organization` de Better Auth usado tal cual (no custom schema); roles owner/member únicamente en este slice, RBAC completo queda en M11.
  - Sin proveedor de email: invitaciones exponen el token/link en la respuesta de la API, no se envía correo (doc-first: no hay ADR de proveedor de email).
  - Tests corren contra el proyecto Neon REAL (no había Docker ni una BD de prueba separada) — decisión explícita del usuario, riesgo documentado en RISKS.md R-005/R-006.
  - dotenv-cli adoptado para cargar .env de la raíz de forma consistente en todos los scripts (build/test/dev/db:*).

archivos_modificados:
  - docs/domain/organization-user.md, docs/slices/VS-003.md (spec doc-first)
  - packages/db/** (nuevo paquete: client.ts, auth.ts, schema/auth.ts generado, drizzle.config.ts, tests __tests__/auth.test.ts, vitest.config.ts)
  - apps/web/** (nuevo: Next.js App Router, app/api/auth/[...all]/route.ts)
  - turbo.json (fix outputs de build para .next/**), package.json raíz (dotenv-cli)
  - docs/database/README.md, docs/RISKS.md (R-005, R-006), docs/TECH_DEBT.md (TD-001, TD-002), docs/BACKLOG.md, docs/CHANGELOG.md

proximos_pasos:
  - VS-004: Dominio core CRUD (Framework/Dimensión/Indicador/Subindicador) — API tipada SDK-first
  - Antes de VS-004: especificar en docs/domain/ los agregados del núcleo de evaluación con sus invariantes (doc-first), incluyendo el organizationId obligatorio en cada tabla (invariante ya anotada en organization-user.md)
  - Pendiente no bloqueante: cambiar DATABASE_URL a connection string pooled antes de un despliegue real

bloqueos: []

contexto_para_continuar: |
  VS-001/002/003 completados y verdes (pnpm slice:close: build+test+typecheck).
  Stack cerrado: Next.js+Vercel Hobby, Neon (real, ya provisionado y con schema
  de auth aplicado), Drizzle, Better Auth (plugin organization), Cloudflare R2,
  Vitest+Playwright, pnpm+Turborepo. packages/db expone `auth`, `db`, `schema`.
  apps/web sirve /api/auth/[...all]. 6 tests de auth pasan contra Neon real con
  limpieza automática. .env en la raíz (gitignored) tiene DATABASE_URL,
  BETTER_AUTH_URL, BETTER_AUTH_SECRET — cargado vía dotenv-cli en los scripts,
  no hace falta exportarlo a mano. Para retomar: leer este archivo, luego
  docs/BACKLOG.md, luego especificar el dominio del núcleo de evaluación
  (Framework/Dimensión/Indicador/Subindicador) antes de VS-004.
  Comando de verificación: pnpm install && pnpm slice:close.
