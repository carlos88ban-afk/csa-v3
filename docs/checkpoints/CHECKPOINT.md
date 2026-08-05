checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000006
fecha: 2026-08-05
estado: en_progreso
slice_actual: VS-009

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008]

decisiones_del_dia:
  - VS-008 (engine/components) especificado doc-first en engines/components.md: "pluggable" en v1 significa un solo lugar de verdad en código para metadata de tipo (registry estático en TypeScript), no un constructor no-code de tipos nuevos para administradores ni un registry persistido en BD — ambos quedan explícitamente fuera de alcance con su justificación.
  - Bug real de tipos en VS-008: anotar `componentRegistry` con un tipo explícito (`: readonly ComponentDefinition[]`) ensanchaba los literales de cada entrada y dejaba el chequeo de exhaustividad en compile-time vacío (compilaba aunque se borraran entradas reales). Resuelto con `as const satisfies` en vez de una anotación de tipo.
  - A partir de VS-008, la verificación manual en navegador se hace contra producción (https://csa-v3-web.vercel.app), no contra el servidor de desarrollo local — decisión explícita del usuario. El flujo es: slice:close local (build+test+typecheck) → commit → push (dispara deploy automático en Vercel, confirmado funcionando desde el push de VS-007) → esperar Ready → verificar en Chrome contra la URL de producción → limpiar datos de prueba de Neon.
  - Cuenta/organización de prueba de VS-008 (vs008-verify@example.com / "Org VS-008") creadas en producción, verificadas (incluida consulta directa a Neon confirmando `componentVersion` persistido) y limpiadas al terminar — no quedan datos de prueba.

archivos_modificados:
  - docs/engines/components.md, docs/slices/VS-008.md (spec + resultado doc-first)
  - packages/sdk-core/src/component-registry.ts, component-registry.test.ts (nuevos)
  - packages/sdk-core/src/form-schema.ts (formElementBase + componentVersion)
  - apps/web/.../subindicators/[subindicatorId]/page.tsx (consume el registry en vez de estructuras locales)
  - docs/engines/README.md, docs/ROADMAP.md, docs/BACKLOG.md, docs/CHANGELOG.md, docs/project_notes/issues.md

proximos_pasos:
  - M6/VS-009: Publicación + enlaces seguros (`engine/publishing`). Especificar `docs/engines/publishing.md` antes de implementar (doc-first). Esto es lo que formalmente habilita la publicación de Evaluaciones — el despliegue a Vercel ya existe desde antes de tiempo (ver decisión del 2026-08-04), pero la funcionalidad de "publicar con enlaces seguros" en sí sigue sin construirse.
  - Pendiente no bloqueante: proveedor de email (BACKLOG), migraciones versionadas de Drizzle (TECH_DEBT TD-001), Playwright (TECH_DEBT TD-003).

bloqueos: []

contexto_para_continuar: |
  M0 a M5 completados y verdes (pnpm slice:close: 5 tasks build, 12 tests, 5
  tasks typecheck). engine/form (VS-007) y engine/components (VS-008) ya
  existen: un Subindicador puede tener un formulario real con 7 tipos de
  elemento, cada uno versionado contra un registry único en sdk-core. La app
  vive en producción (https://csa-v3-web.vercel.app) y el flujo de trabajo
  desde VS-008 verifica manualmente ahí, no en localhost — el push a
  origin/main dispara un deploy automático de Vercel (confirmado, toma
  ~30s en quedar Ready). Servidor de desarrollo local no se usó en VS-008,
  puede o no estar corriendo. No quedan datos de prueba en Neon (limpiados
  tras cada verificación). Para retomar: leer este archivo, luego
  docs/BACKLOG.md, luego especificar docs/engines/publishing.md antes de
  VS-009. Comando de verificación: pnpm install && pnpm slice:close.
