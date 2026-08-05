checkpoint: c9e1a1b0-0004-4a2b-8c3d-00000000000e
fecha: 2026-08-05
estado: en_progreso
slice_actual: ninguno — TD-003 pagada, siguiente es TD-001+TD-002 juntas

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003]

decisiones_del_dia:
  - Deuda técnica priorizada con el usuario: TD-003 (Playwright) primero, luego TD-001+TD-002 juntas (migraciones versionadas + rama Neon de test), porque provisionar el segundo entorno Neon que TD-002 necesita es exactamente la condición de disparo que TD-001 ya tenía declarada.
  - TD-003 pagada: Playwright en `apps/web/e2e/`, dos specs (`builder-publish.spec.ts`, `public-runtime.spec.ts`) cubriendo Builder→Publicar y Runtime público. Fixtures vía `auth.api.*`/`packages/db` directo en Node — nunca contraseña en un formulario ni por HTTP (regla de seguridad de la sesión, sin excepciones ni para cuentas descartables).
  - Corre contra `next dev` LOCAL, no producción (única excepción al criterio "verificar contra Vercel" del resto del proyecto) — e2e necesita crear y borrar datos de test constantemente, y hacerlo contra producción ensuciaría datos reales (mismo riesgo ya aceptado en R-005/TD-002 para los tests de `packages/db`).
  - Este trabajo encontró y corrigió 2 bugs reales de producción, no solo agregó cobertura: (1) el Runtime tenía preguntas sin label realmente asociado pese a que VS-015 lo daba por verificado — corregido separando controles simples (`<label>`) de grupos (`<fieldset>`+`<legend>`); (2) el autosave del Runtime tenía una condición de carrera de pérdida de datos real — el fetch de hidratación de respuestas guardadas podía sobreescribir una respuesta recién tecleada, y el mecanismo de disparo del autosave asumía (incorrectamente) que el updater de `setState` se ejecuta de forma síncrona — reescrito al patrón correcto (`useEffect` reactivo al estado ya comprometido por React, no lectura especulativa post-`setState`).
  - `packages/db/src/test-utils.ts` nuevo (`deleteTestFixtures`) para que el teardown de e2e pueda borrar fixtures sin que `apps/web` tenga que importar `drizzle-orm` directo (mantiene ese acoplamiento encapsulado en `packages/db`, regla ya establecida).
  - Verificado con 2 corridas consecutivas en verde de `pnpm test:e2e` (3/3 specs) más `pnpm slice:close` (build+test+typecheck) en verde.

archivos_modificados:
  - apps/web/e2e/ (nuevo: playwright.config.ts, global-setup.ts, global-teardown.ts, builder-publish.spec.ts, public-runtime.spec.ts)
  - apps/web/app/evaluations/[token]/page.tsx (labels de Runtime con asociación real; autosave reescrito a patrón useEffect; fusión de hidratación con ediciones locales en curso)
  - packages/db/src/test-utils.ts (nuevo), packages/db/src/index.ts (export)
  - apps/web/package.json (script test:e2e, devDependency @playwright/test), apps/web/.gitignore (e2e/.auth)
  - docs/TECH_DEBT.md (TD-003 movida a "Pagada"), docs/BACKLOG.md, docs/CHANGELOG.md, docs/project_notes/issues.md

proximos_pasos:
  - Siguiente: TD-001 + TD-002 juntas — provisionar una rama/proyecto Neon aislado para tests, migrar los tests de `packages/db` a apuntar ahí, y migrar de `drizzle-kit push` a migraciones versionadas (`generate`/`migrate`).
  - Candidatos nuevos (AN-001, ver docs/analysis/csa-sp-global-comparison.md — NO comprometidos, requieren alinear con el usuario): opciones anidadas en selecciones, campo URL pública, estado por pregunta + flujo Approved/Submitted, N/A + comentarios confidenciales, Save/Cancel/Reset, numeración automática. Si el usuario los prioriza, cada uno entra a BACKLOG.md y se diseña doc-first en docs/engines/form.md.
  - Pendiente no bloqueante, sigue en BACKLOG.md: proveedor de email (ADR), tabla de historial de revisiones de formSchema si se necesita fuera del contexto de publicación.

bloqueos: []

contexto_para_continuar: |
  Roadmap original M0-M12 completo (checkpoint anterior) + TD-003 (Playwright
  E2E) pagada en este checkpoint. La plataforma sigue viva en producción
  (https://csa-v3-web.vercel.app) sin cambios funcionales de este trabajo más
  allá de los 2 bugs reales corregidos en el Runtime (labels + race condition
  de autosave) — ambos ya verificados con `pnpm slice:close` en verde y con
  Playwright pasando 2 corridas consecutivas contra `next dev` local.
  Los tests e2e nuevos corren SOLO local (`pnpm --filter @plataforma-csa/web
  test:e2e`, requiere un `next dev` — el propio comando lo levanta si no hay
  uno ya corriendo en :3000) — es la única parte del proyecto que no se
  verifica contra Vercel, a propósito (ver TECH_DEBT.md).
  Para retomar: leer este archivo, luego docs/BACKLOG.md, luego empezar
  TD-001+TD-002 (provisionar rama Neon de test + migraciones versionadas de
  Drizzle) — ya no requiere alinear con el usuario, la priorización ya está
  confirmada.
  Comando de verificación: pnpm install && pnpm slice:close && pnpm
  --filter @plataforma-csa/web test:e2e.
