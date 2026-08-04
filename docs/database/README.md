# Base de datos

Esquema generado por el plugin `organization` de Better Auth (`@better-auth/cli generate`, ver `docs/domain/organization-user.md`) y aplicado a Neon con `drizzle-kit push`. Fuente: `packages/db/src/schema/auth.ts` — ese archivo es generado, no se edita a mano; para cambiarlo se ajusta la config de `packages/db/src/auth.ts` y se regenera (`pnpm --filter @plataforma-csa/db db:generate-auth-schema`).

## Tablas (VS-003)

| Tabla | Columnas relevantes | Notas |
|---|---|---|
| `user` | id, name, email (único), email_verified, image, created_at, updated_at | |
| `session` | id, token (único), user_id → user, active_organization_id, expires_at, ip_address, user_agent | `active_organization_id` es la organización activa de la sesión (tenant-scoping) |
| `account` | id, user_id → user, provider_id, password (hash), tokens OAuth (sin usar en VS-003) | Solo se usa `password` — no hay proveedores OAuth configurados |
| `verification` | id, identifier, value, expires_at | Infraestructura interna de Better Auth |
| `organization` | id, name, slug (único), logo, metadata, created_at | El agregado "Organización" del dominio (ver `docs/domain/organization-user.md`) |
| `member` | id, organization_id → organization, user_id → user, role (`owner` \| `member`), created_at | El creador de una organización queda como `owner` |
| `invitation` | id, organization_id → organization, email, role, status, expires_at, inviter_id → user | **El envío de email está desactivado** (`sendInvitationEmail` es un no-op en `packages/db/src/auth.ts`) — no hay proveedor de email decidido en el stack. El link/token de aceptación se expone en el valor de retorno de `createInvitation`, no se envía por correo |

## Migraciones

`drizzle-kit push` (no migraciones versionadas todavía — aceptable en esta etapa temprana; se revisará si el equipo crece o se necesita rollback histórico, ver `../TECH_DEBT.md`).

## Conexión

`DATABASE_URL` (Neon, conexión directa — no pooled, ver nota en `../RISKS.md` R-005) vive en `.env` en la raíz del monorepo (gitignored). Cargada por `dotenv-cli` en los scripts `build`/`test`/`dev`/`db:*` de `packages/db` y `apps/web` — no hay que exportarla manualmente.
