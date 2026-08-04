checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000004
fecha: 2026-08-04
estado: en_progreso
slice_actual: VS-007

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006]

decisiones_del_dia:
  - VS-006 (Builder UI) verificado de punta a punta en Chrome real (claude-in-chrome), no solo con tests automatizados — a pedido explícito del usuario.
  - apps/web/tsconfig.json necesitaba "lib": ["ES2022", "DOM", "DOM.Iterable"] explícito (heredaba solo ES2022 de tsconfig.base.json) — sin esto, tipos de eventos DOM y fetch fallaban de forma confusa.
  - Se añadió components/app-header.tsx (logout) no especificado en el contrato original — hueco de usabilidad real detectado durante la verificación manual.
  - Datos de la cuenta de verificación (org "Org Demo VS-006", framework "Framework ESG Demo", etc.) se dejaron a propósito en el Neon real para que el usuario también pueda revisarlos en el navegador.
  - Next.js 16 autogenera apps/web/AGENTS.md y apps/web/CLAUDE.md en cada `next dev` (avisos de breaking changes de esa versión) — se dejan y commitean, es el comportamiento recomendado por el propio framework.

archivos_modificados:
  - docs/slices/VS-006.md (spec + resultado doc-first)
  - apps/web/lib/auth-client.ts, apps/web/lib/api-client.ts (nuevos)
  - apps/web/app/{signup,login,organizations,frameworks}/page.tsx, apps/web/app/frameworks/[frameworkId]/**/page.tsx (nuevos, árbol completo)
  - apps/web/components/app-header.tsx (nuevo), apps/web/app/layout.tsx (actualizado)
  - apps/web/app/page.tsx (reescrito, redirección según sesión)
  - apps/web/tsconfig.json (+lib DOM)
  - apps/web/AGENTS.md, apps/web/CLAUDE.md (autogenerados por Next.js, commiteados)
  - docs/ROADMAP.md, docs/BACKLOG.md, docs/CHANGELOG.md, docs/TECH_DEBT.md (TD-003), docs/project_notes/issues.md

proximos_pasos:
  - M4/VS-007: Form Engine v1 — elementos básicos dentro de un Subindicador, validación, autosave. Este es el primer motor real (engine/form) de docs/architecture/overview.md.
  - Antes de VS-007: especificar en docs/engines/form.md el diseño del motor (tipos de elemento soportados en v1, estructura de formSchema que ya existe como columna jsonb desde VS-004, estrategia de autosave)
  - Pendiente no bloqueante: proveedor de email (BACKLOG), connection string pooled (RISKS R-006), migraciones versionadas (TECH_DEBT TD-001), Playwright (TECH_DEBT TD-003)

bloqueos: []

contexto_para_continuar: |
  M0 a M3 completados y verdes (pnpm slice:close: 5 tasks build, 12 tests, 5 tasks
  typecheck). Además del backend (auth + dominio core), ahora existe una UI real
  y funcional en apps/web: signup/login/logout, gestión de organización activa,
  y el árbol completo Framework→Dimensión→Indicador→Subindicador con CRUD,
  verificado manualmente en Chrome (no solo tests). Servidor de desarrollo
  corría en http://localhost:3000 al cierre de esta sesión (puede haberse
  detenido; relanzar con `pnpm --filter @plataforma-csa/web dev`). Hay datos
  de verificación reales en el Neon del proyecto (org "Org Demo VS-006") que
  se dejaron a propósito. Para retomar: leer este archivo, luego
  docs/BACKLOG.md, luego especificar docs/engines/form.md antes de VS-007
  (el motor de formularios es la pieza central que faltaba — formSchema ya
  existe como columna desde VS-004 pero vacía).
  Comando de verificación: pnpm install && pnpm slice:close.
