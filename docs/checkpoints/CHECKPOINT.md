checkpoint: c9e1a1b0-0003-4a2b-8c3d-000000000003
fecha: 2026-08-04
estado: en_progreso
slice_actual: VS-006

slices_completados: [VS-001, VS-002, VS-003, VS-004]

decisiones_del_dia:
  - VS-004 fusiona el VS-004 (API) + VS-005 (migraciones) del roadmap original en un solo slice funcional — mismo patrón que VS-003.
  - formSchema/revisionNumber de Subindicador ya existen a nivel de servicio (packages/db) pero no se exponen en la API pública todavía — motor de formularios es M4 (VS-007).
  - Autorización: servicio recibe organizationId ya resuelto; requireActiveMember (packages/db/src/authz.ts) es quien autentica y resuelve la organización activa en las rutas API.
  - Bug de Turbopack corregido: imports relativos con extensión .js hacia apps/web/lib fallaban ("Module not found") aunque tsc los resolvía bien — se migró a los alias @/* de tsconfig.json.

archivos_modificados:
  - docs/domain/evaluation-hierarchy.md, docs/slices/VS-004.md (spec doc-first)
  - packages/db/src/schema/domain.ts, src/domain/service.ts, src/authz.ts (nuevo), src/index.ts (actualizado)
  - packages/sdk-core/src/domain.ts (nuevo, zod schemas + tipos), src/index.ts (actualizado), package.json (+zod)
  - apps/web/lib/api-errors.ts (nuevo), apps/web/app/api/{frameworks,dimensions,indicators,subindicators}/route.ts y /[id]/route.ts (8 archivos nuevos), package.json (+sdk-core, +zod)
  - docs/database/README.md, docs/ROADMAP.md, docs/BACKLOG.md, docs/CHANGELOG.md, docs/project_notes/issues.md

proximos_pasos:
  - M3/VS-006: Builder jerárquico (árbol simple) — primera UI real sobre el CRUD de VS-004
  - Antes de VS-006: especificar en docs/domain/ (o un nuevo doc) el diseño de pantallas del Builder (una responsabilidad por pantalla, ver VISION.md) si aplica, o ir directo a implementación si el diseño ya es suficientemente claro en el brief original del usuario

bloqueos: []

contexto_para_continuar: |
  VS-001 a VS-004 completados y verdes (pnpm slice:close: 5 tasks build, 12 tests,
  5 tasks typecheck — todo en apps/web + packages/db + packages/sdk-core).
  Modelo core completo: Framework/Dimension/Indicator/Subindicator con CRUD
  tenant-scoped, 8 rutas API REST en apps/web, contratos compartidos en
  sdk-core. Stack sin cambios respecto al checkpoint anterior. .env sigue
  en la raíz (gitignored), cargado vía dotenv-cli. Para retomar: leer este
  archivo, luego docs/BACKLOG.md, luego decidir si VS-006 (Builder UI)
  necesita spec adicional o se implementa directo sobre el CRUD ya probado.
  Comando de verificación: pnpm install && pnpm slice:close.
