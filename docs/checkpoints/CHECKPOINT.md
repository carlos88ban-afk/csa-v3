checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000005
fecha: 2026-08-05
estado: en_progreso
slice_actual: VS-008

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007]

decisiones_del_dia:
  - Se adelantó el despliegue a Vercel (plan Hobby, ADR-0001) antes de M6/VS-009, a pedido explícito del usuario, solo para exponer el hosting — la funcionalidad de publicación con enlaces seguros sigue pendiente en su orden original. URL: https://csa-v3-web.vercel.app (ver `project_notes/key_facts.md`).
  - Bug real de infraestructura: Turborepo 2.x no pasaba `DATABASE_URL`/`BETTER_AUTH_*` a las tasks en Vercel pese a estar configuradas — requería `globalEnv` explícito en `turbo.json`. Documentado en `project_notes/bugs.md`.
  - Bug real de auth: `BETTER_AUTH_URL` de producción no coincidía con el origin real, causando 403 `INVALID_ORIGIN` en signup — corregido. R-006 (connection string no pooled) cerrado de paso: local y producción ya usan la pooled.
  - VS-007 (Form Engine v1) especificado doc-first en `engines/form.md` antes de implementar, siguiendo la regla rectora. Verificado de punta a punta en Chrome real, no solo con tests.
  - Dos bugs reales de diseño encontrados y corregidos durante la verificación manual de VS-007 (autosave disparándose sin edición del usuario; validación demasiado estricta bloqueando el guardado de un borrador) — ver hallazgos en `slices/VS-007.md`.
  - Intento de delegar el Form Editor (VS-007) a un subagente OpenCode falló por un problema de entorno (heredoc bash en Windows) — se implementó directamente. Mismo patrón de fallo ya visto en VS-003.

archivos_modificados:
  - docs/engines/form.md, docs/engines/README.md, docs/slices/VS-007.md (spec + resultado doc-first)
  - packages/sdk-core/src/form-schema.ts, form-schema.test.ts (nuevos); domain.ts, index.ts (actualizados)
  - packages/db/src/__tests__/domain.test.ts (test de revisionNumber con FormSchema realista)
  - apps/web/app/api/subindicators/[id]/route.ts (expone formSchema)
  - apps/web/app/frameworks/.../subindicators/[subindicatorId]/page.tsx (nuevo, Form Editor)
  - apps/web/app/frameworks/.../indicators/[indicatorId]/page.tsx (enlace "Abrir formulario")
  - turbo.json (globalEnv para Vercel)
  - docs/RISKS.md (R-006 cerrado), docs/project_notes/{bugs,decisions,key_facts,issues}.md
  - docs/ROADMAP.md, docs/BACKLOG.md, docs/CHANGELOG.md

proximos_pasos:
  - M5/VS-008: Registry de componentes pluggable + versionado (`engine/components`). Especificar `docs/engines/components.md` antes de implementar (doc-first).
  - Pendiente no bloqueante: proveedor de email (BACKLOG), migraciones versionadas de Drizzle (TECH_DEBT TD-001), Playwright (TECH_DEBT TD-003).

bloqueos: []

contexto_para_continuar: |
  M0 a M4 completados y verdes (pnpm slice:close: 5 tasks build, 12 tests, 5
  tasks typecheck). El proyecto ahora tiene su primer motor real (engine/form
  v1): un Subindicador puede tener un formulario real con 7 tipos de elemento
  (texto corto/largo, número, selección única/múltiple, instrucción, banner),
  editable en un Form Editor con autosave, verificado de punta a punta en
  Chrome real. Además, la app está desplegada en producción en Vercel
  (https://csa-v3-web.vercel.app) desde antes de tiempo (adelantado a pedido
  del usuario, no forma parte del roadmap todavía como funcionalidad de
  publicación — eso es VS-009/M6). Servidor de desarrollo local puede haberse
  detenido; relanzar con `pnpm --filter @plataforma-csa/web dev`. Datos de
  verificación de VS-007 se crearon y se limpiaron del Neon real (no quedan
  datos de prueba de VS-007, a diferencia de VS-006 donde sí se dejaron
  a propósito). Para retomar: leer este archivo, luego docs/BACKLOG.md,
  luego especificar docs/engines/components.md antes de VS-008.
  Comando de verificación: pnpm install && pnpm slice:close.
