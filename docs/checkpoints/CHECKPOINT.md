checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000007
fecha: 2026-08-05
estado: en_progreso
slice_actual: VS-010

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009]

decisiones_del_dia:
  - VS-009 (engine/publishing) especificado doc-first en engines/publishing.md. Decisión central: Evaluación guarda un snapshot completo e inmutable del árbol al publicar, no un puntero a revisionNumber — el schema actual (VS-004/VS-007) no conserva historial de formSchema (cada UPDATE sobrescribe la fila), así que un puntero sería inútil sin una tabla de historial que nadie pidió construir todavía.
  - Nueva tabla `evaluation` (organizationId/frameworkId/token único/title/snapshot jsonb/publishedAt), aplicada a Neon con `db:push`. Revocar un enlace = borrar la fila (mismo patrón CRUD que el resto del dominio, sin soft-delete).
  - `getEvaluationByToken` es la única función de todo el dominio sin parámetro `organizationId` — a propósito, documentado explícitamente: la seguridad del enlace público depende del token (192 bits de entropía), no de una sesión.
  - Bug real: `drizzle.config.ts` no incluía la ruta del nuevo archivo de schema (`evaluation.ts`) — `db:push` reportaba "No changes detected" en vez de crear la tabla, sin error visible. Mismo patrón de bug ya visto con `turbo.json`/`globalEnv` (Vercel): un archivo de configuración con lista explícita de rutas que hay que recordar actualizar junto con el archivo nuevo.
  - Verificación en producción de VS-009 fue más rigurosa que solo visual: se usó `curl` sin cookies para confirmar que el endpoint público responde sin sesión, y que revocar lo tumba a 404 de inmediato — una revisión solo en el navegador (misma pestaña con sesión activa) no habría probado la ausencia de dependencia de sesión.
  - Cuenta/organización de prueba de VS-009 (vs009-verify@example.com / "Org VS-009") creadas, verificadas y limpiadas de Neon al terminar.

archivos_modificados:
  - docs/engines/publishing.md, docs/slices/VS-009.md (spec + resultado doc-first)
  - packages/db/src/schema/evaluation.ts, domain/evaluation-service.ts, __tests__/evaluation.test.ts (nuevos)
  - packages/db/drizzle.config.ts (agrega evaluation.ts a schema paths)
  - packages/sdk-core/src/evaluation.ts, evaluation.test.ts (nuevos)
  - apps/web/app/api/evaluations/**, apps/web/app/api/public/evaluations/[token]/route.ts (nuevos)
  - apps/web/app/evaluations/[token]/page.tsx (nuevo, página pública)
  - apps/web/app/frameworks/[frameworkId]/page.tsx (botón Publicar + lista)
  - docs/engines/README.md, docs/ROADMAP.md, docs/BACKLOG.md, docs/CHANGELOG.md, docs/project_notes/issues.md

proximos_pasos:
  - M7/VS-010: Runtime de respuesta + guardar progreso (`engine/persistence`). Especificar `docs/engines/persistence.md` antes de implementar (doc-first). Esto construye el formulario INTERACTIVO sobre la página pública que VS-009 dejó de solo lectura — captura de respuestas + autosave de progreso del evaluado.
  - Pendiente no bloqueante: proveedor de email (BACKLOG), migraciones versionadas de Drizzle (TECH_DEBT TD-001), Playwright (TECH_DEBT TD-003), tabla de historial de revisiones de formSchema si se necesita fuera del contexto de publicación (ver engines/publishing.md).

bloqueos: []

contexto_para_continuar: |
  M0 a M6 completados y verdes (pnpm slice:close: 5 tasks build, 16 tests, 5
  tasks typecheck). Un Framework ahora se puede publicar (VS-009) como
  Evaluación con un enlace público seguro, sin necesidad de cuenta —
  verificado con curl que no depende de sesión. La página pública
  (apps/web/app/evaluations/[token]/page.tsx) es de solo lectura: muestra
  el árbol completo congelado en el momento de publicar, pero no captura
  respuestas todavía — eso es M7/VS-010, el siguiente slice. La app vive en
  producción (https://csa-v3-web.vercel.app); el flujo de trabajo desde
  VS-008 verifica ahí, no en localhost. No quedan datos de prueba en Neon.
  Para retomar: leer este archivo, luego docs/BACKLOG.md, luego especificar
  docs/engines/persistence.md antes de VS-010.
  Comando de verificación: pnpm install && pnpm slice:close.
