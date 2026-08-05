# Changelog

Formato: por slice, no por commit individual.

## [Unreleased]

### VS-007 — Form Engine v1 (2026-08-05)

- `docs/engines/form.md`: especificación doc-first del primer motor real (`engine/form`) — 7 tipos de elemento v1, estructura del Form Schema, autosave, fuera de alcance explícito (Runtime, tipos que dependen de M5/M8/M10).
- `packages/sdk-core/src/form-schema.ts` (nuevo): `formElement` (zod discriminated union) y `formSchema`, con `schemaVersion` independiente de `revisionNumber`. `updateSubindicatorInput` gana el campo `formSchema` (antes excluido a propósito).
- `apps/web/app/api/subindicators/[id]/route.ts`: acepta `formSchema` en el `PATCH` (la persistencia y el versionado ya existían desde VS-004, solo faltaba exponerlo).
- Form Editor nuevo (`apps/web/.../subindicators/[subindicatorId]/page.tsx`): agregar/editar/reordenar/borrar Elementos, autosave con debounce de 1500ms. Enlace "Abrir formulario" añadido a la lista de Subindicadores.
- Test de integración en `packages/db` actualizado con contenido `FormSchema` realista (antes usaba un objeto no representativo).
- Verificado de punta a punta en Chrome real: los 7 tipos de elemento, reordenar, borrar, autosave, y persistencia tras recargar la página.
- **Dos bugs reales corregidos durante la verificación manual** (no solo tipeo):
  1. El autosave se disparaba con solo cargar la página (sin edición del usuario) por depender de un `useEffect` reactivo sobre `elements` — rediseñado para que el autosave se dispare únicamente desde los manejadores de mutación explícitos del usuario.
  2. Un elemento recién agregado (con `label` vacío) fallaba la validación zod y mostraba "Error al guardar" antes de que el usuario pudiera escribir — se relajó el esquema para permitir `label` vacío en un borrador (la validación de "listo para publicar" es de `engine/publishing`, M6).
- Intento de delegar el Form Editor a OpenCode falló por un problema de heredoc de bash en este entorno Windows (~35 min, sin producir el archivo) — se implementó directamente.

### VS-006 — Builder jerárquico (UI) (2026-08-04)

- Cliente Better Auth (`better-auth/react` + plugin `organization`) en `apps/web/lib/auth-client.ts`.
- Páginas: `/signup`, `/login`, `/organizations` (crear/seleccionar organización activa), `/frameworks`, `/frameworks/[id]`, `.../dimensions/[id]`, `.../indicators/[id]` (CRUD de Subindicador con edición inline y borrado).
- `components/app-header.tsx`: header mínimo con email de sesión y cerrar sesión (no especificado originalmente, añadido por necesidad real de usabilidad).
- Corregido: `apps/web/tsconfig.json` no incluía la lib `DOM`, causando errores de tipo confusos en manejadores de eventos y `fetch`.
- Flujo completo (registro → organización → Framework → Dimensión → Indicador → Subindicador → editar → borrar → logout → login) verificado manualmente en Chrome real, no solo con tests automatizados.
- Mismo bug de imports `.js` relativos vs alias `@/*` que en VS-004, evitado desde el inicio en este slice.

### VS-004 — Dominio core CRUD + schema (2026-08-04)

- `docs/domain/evaluation-hierarchy.md`: especificación doc-first del modelo core, fusiona el alcance de VS-004+VS-005 del roadmap original en un slice.
- Schema Drizzle nuevo en `packages/db` (`framework`, `dimension`, `indicator`, `subindicator`), todas con `organizationId` denormalizado, aplicado a Neon.
- Contratos compartidos (zod + tipos) en `packages/sdk-core/src/domain.ts` — SDK-first.
- Servicio CRUD tenant-scoped en `packages/db/src/domain/service.ts` con validación de jerarquía entre organizaciones y versionado de `formSchema`/`revisionNumber` en Subindicador (motor de formularios en sí queda para M4).
- 8 rutas API REST en `apps/web` (`/api/frameworks`, `/dimensions`, `/indicators`, `/subindicators`, cada una con `[id]`).
- 6 tests nuevos en `packages/db` (12 en total con VS-003) contra Neon real.
- Corregido: imports relativos con extensión `.js` hacia `apps/web/lib/` fallaban en Turbopack (Next.js 16) — se migró a los alias `@/*`.

### VS-003 — Auth + Organización (2026-08-04)

- `docs/domain/organization-user.md`: especificación doc-first del agregado Organization/User/Member/Invitation.
- `packages/db` (nuevo): cliente Drizzle sobre Neon, schema de Better Auth generado con su CLI oficial (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`), aplicado a Neon con `drizzle-kit push`.
- Configuración de Better Auth con plugin `organization`: email/password, roles `owner`/`member`, envío de email de invitación desactivado (no hay proveedor de email decidido — el link de aceptación se expone en la respuesta de la API).
- `apps/web` (nuevo): primera app Next.js del monorepo, App Router, con la ruta `app/api/auth/[...all]` sirviendo Better Auth.
- 6 tests de Vitest en `packages/db` cubriendo registro, login, creación de organización, invitación sin email, aceptación de invitación, y tenant-scoping — corren contra el proyecto Neon real con limpieza automática de datos.
- `dotenv-cli` añadido para cargar el `.env` de la raíz de forma consistente en `build`/`test`/`dev`/`db:*`, incluso bajo Turborepo.
- `turbo.json`: corregidos los `outputs` de la task `build` para incluir `.next/**` (antes solo cacheaba `dist/**`).

### VS-002 — Gobernanza + Checkpoint Manager (2026-08-04)

- Añadido árbol completo de `docs/` (visión, objetivos, alcance, roadmap, backlog, riesgos, deuda técnica, dominio, arquitectura, ADRs 0001–0005, checkpoints, project_notes).
- Registradas ADR-0001 (hosting), 0002 (BD), 0003 (storage), 0004 (auth) como `Proposed`; ADR-0005 (tooling) como `Accepted` (ya implementada en VS-001).

### VS-001 — Scaffold monorepo (2026-08-04)

- `git init` del repositorio.
- pnpm workspace + Turborepo + TypeScript strict (`tsconfig.base.json`).
- `packages/sdk-core` mínimo con test real (build/test/typecheck verificados en verde localmente).
- CI en GitHub Actions (`.github/workflows/ci.yml`).
