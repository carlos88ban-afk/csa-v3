checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000008
fecha: 2026-08-05
estado: en_progreso
slice_actual: VS-011

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010]

decisiones_del_dia:
  - VS-010 (engine/persistence) especificado doc-first en engines/persistence.md. Decisión central: la Respuesta se ata a `evaluationId` (resuelto vía token), no a una identidad de evaluado — no existe concepto de cuenta de evaluado en el dominio; un enlace publicado es una sesión de respuesta compartida, mismo principio que "sin colaboración concurrente" ya aceptado en engines/form.md.
  - Nueva tabla `response` (evaluationId/subindicatorId/answers jsonb), única por (evaluationId, subindicatorId), aplicada a Neon con `db:push`. `subindicatorId` sin FK hacia `subindicator` a propósito: la Evaluación es un snapshot congelado, el Subindicador original puede editarse/borrarse sin afectarla — `response-service.ts` valida contra el snapshot en su lugar.
  - Runtime UI reescrito por completo (antes: un solo scroll de solo lectura de VS-009). Incorpora las mejoras identificadas al comparar con el portal S&P Global CSA (pedido explícito del usuario): árbol de navegación persistente por Framework/Dimensión/Indicador/Subindicador (no breadcrumb lineal), Prev/Next, banners con color por variant, progreso global y por punto del árbol.
  - Delegada la escritura de los contratos zod de `packages/sdk-core/src/response.ts` (+ tests) a un subagente de OpenCode — tarea mecánica con el contrato ya decidido, mismo patrón que `form-schema.ts`. Revisado antes de integrar.
  - Verificación en producción de VS-010 usó una sesión ya activa en el navegador (`ui-verify@example.com`, sin organización) en vez de crear una cuenta nueva — no se escribió ninguna contraseña en ningún formulario ni por API (regla de seguridad sin excepciones). El árbol de contenido de prueba se creó vía `fetch` autenticado desde la propia página (mismas rutas que usa la UI), no clic a clic.

archivos_modificados:
  - docs/engines/persistence.md, docs/slices/VS-010.md, docs/engines/README.md (spec + resultado doc-first)
  - packages/db/src/schema/response.ts, domain/response-service.ts, __tests__/response.test.ts (nuevos)
  - packages/db/drizzle.config.ts (agrega response.ts), src/index.ts (exports)
  - packages/sdk-core/src/response.ts, response.test.ts (nuevos), src/index.ts (export)
  - apps/web/app/api/public/evaluations/[token]/responses/route.ts, .../[subindicatorId]/route.ts (nuevos)
  - apps/web/lib/api-client.ts (agrega método put)
  - apps/web/app/evaluations/[token]/page.tsx (reescrito: árbol, Prev/Next, render real de elementos, autosave, progreso)
  - apps/web/app/globals.css (reemplaza .eval-* por .runtime-*/.tree-dot)
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md

proximos_pasos:
  - M8/VS-011: Evidencias (uploads → R2). Especificar antes de implementar (doc-first) — extiende engine/persistence y engine/components con un tipo de elemento que depende de almacenamiento de archivos.
  - Pendiente no bloqueante: proveedor de email (BACKLOG), migraciones versionadas de Drizzle (TECH_DEBT TD-001), Playwright (TECH_DEBT TD-003), tabla de historial de revisiones de formSchema si se necesita fuera del contexto de publicación (ver engines/publishing.md).

bloqueos: []

contexto_para_continuar: |
  M0 a M7 completados y verdes (pnpm slice:close: 5 tasks build, 52 tests, 5
  tasks typecheck). La página pública de una Evaluación
  (apps/web/app/evaluations/[token]/page.tsx) ya no es de solo lectura: el
  evaluado responde preguntas usando un árbol de navegación persistente +
  Prev/Next, con autosave (tabla `response`, debounce 1500ms) y progreso
  visible por Subindicador/global — sin necesidad de cuenta, la Respuesta se
  ata al token de la Evaluación. Adjuntar archivos como Evidencia sigue
  fuera de alcance (M8/VS-011, siguiente). La app vive en producción
  (https://csa-v3-web.vercel.app); el flujo de trabajo desde VS-008 verifica
  ahí, no en localhost. No quedan datos de prueba en Neon.
  Para retomar: leer este archivo, luego docs/BACKLOG.md, luego especificar
  un doc de engine/components (o extender persistence.md) para Evidencias
  antes de VS-011.
  Comando de verificación: pnpm install && pnpm slice:close.
