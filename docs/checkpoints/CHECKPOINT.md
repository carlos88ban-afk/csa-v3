checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000021
fecha: 2026-08-14
estado: completo
slice_actual: ninguno — arco VS-033..VS-036 (pivote visual) cerrado, más limpieza de datos de producción y 2 bugs reales del builder corregidos en la misma sesión. Trabajo nuevo pedido por el usuario, no gap de AN-001.

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016, VS-017, VS-018, VS-019, VS-020, VS-021, VS-022, VS-023, VS-024, VS-025, VS-026, VS-027, VS-028, VS-029, VS-030, VS-031, VS-032, VS-033, VS-034, VS-035, VS-036]

decisiones_del_dia:
  - **Nota de continuidad**: este CHECKPOINT no se actualizó tras VS-031/VS-032 en su momento — ambos ya estaban cerrados y en producción al empezar esta sesión (confirmado por `git log`/`CHANGELOG.md`). No se reconstruye retroactivamente esa sesión aquí.
  - **Punto de partida de esta sesión**: bug en producción — `ReferenceError: window is not defined` en SSR de `/frameworks/[frameworkId]/builder`. Diagnosticado con `mcp__plugin_vercel_vercel__get_runtime_errors` (el deployment estaba "READY" pero la ruta seguía rota en runtime). Corregido y verificado antes de seguir.
  - **Pivote de diseño (VS-033..VS-036)**: pedido del usuario de mejorar la calidad visual y aprovechar espacio desaprovechado. La columna angosta (`840px`) resultó ser una **decisión ya documentada deliberadamente** ("estilo ledger", `docs/architecture/design-system.md`) — se presentó la disyuntiva al usuario (`AskUserQuestion`) en vez de asumir que era un descuido; eligió pivotar a dashboard ancho tipo Salesforce/Workday, con sidebar persistente y conteos reales en las tablas desde el inicio. Planificado con Plan Mode (2 Explore + 1 Plan subagente) antes de tocar código, dado el tamaño (shell global + backend + contradice una decisión documentada). Validado con UN mockup de Stitch antes de escribir CSS.
  - **Limpieza de base de datos de producción**: pedido explícito del usuario, dejar exactamente 1 usuario (`carlos88ban@gmail.com`, la cuenta real)/1 organización/1 framework. La base acumulaba 7 organizaciones, 6 frameworks y 12 usuarios de verificaciones de slices anteriores y un leftover de un e2e interrumpido (`test-eval-c08b5d27-*`, nunca limpiado porque esa corrida se cortó antes del `globalTeardown`). Inventario primero (scripts `_inspect.mts` de solo lectura), dry-run antes de `--write` (mismo patrón que `csa-2026-replica.mts`), scripts temporales borrados al terminar. El usuario real no pertenecía a ninguna organización — se lo agregó como owner de la organización conservada antes de borrar al owner de prueba anterior.
  - **2 bugs reales encontrados y corregidos al probar todo de nuevo tras la limpieza** (no introducidos por esta sesión — pre-existentes desde VS-032, solo nunca antes verificados de punta a punta): `resolveFocus()` perdía el foco real al navegar fresco a `/builder?s=<dimensiónVacía>`, y `wizardStep` no reflejaba una Dimensión ya creada al montar el builder fresco. Ver `docs/project_notes/bugs.md` para el diagnóstico completo de cada uno (incluye el hallazgo incidental de la sesión anterior, ahora resuelto). Un tercer hallazgo (`builder-publish.spec.ts` con un selector desactualizado) resultó ser el test, no el producto — confirmado a mano en producción antes de "arreglar" nada del lado de la app.
  - **Verificación e2e con hallazgo importante sobre servidores de dev obsoletos**: un `next dev` de una sesión ANTERIOR seguía escuchando en el puerto 3000 y Playwright lo reutilizó (`reuseExistingServer: true`) sirviendo código desactualizado, produciendo fallos que parecían regresiones. Matado el proceso viejo, corrida limpia.
  - **Confirmación rigurosa de no-regresión con evidencia, no suposición**: `git stash` (moviendo aparte archivos nuevos sin trackear, ya que `git stash push <pathspec>` sin `-u` no los incluye) + correr el mismo e2e contra `main` tal cual publicado, mismo punto de falla exacto — así se confirmó qué era pre-existente antes de tocar código.

archivos_modificados:
  - apps/web/app/frameworks/[frameworkId]/builder/page.tsx (fix SSR window; luego resolveFocus() + sincronización de wizardStep + auto-select de subindicador nuevo)
  - apps/web/e2e/builder-publish.spec.ts (selector "Agregar elemento" actualizado a "Texto"/"Texto de la pregunta")
  - docs/project_notes/bugs.md (5 entradas nuevas: SSR window, resolveFocus/wizardStep, auto-select subindicador, test desactualizado)
  - docs/architecture/design-system.md (sección Layout reescrita — pivote a dashboard ancho, doc-first antes del código)
  - apps/web/app/globals.css (--content-width 840→1180px, --sidebar-width nuevo, .page--wide 960→1280px, .app-shell/.app-sidebar__*, .data-table*)
  - apps/web/components/app-header.tsx (eliminado) → apps/web/components/app-shell.tsx, app-sidebar.tsx, data-table.tsx (nuevos)
  - apps/web/app/layout.tsx (monta AppShell)
  - apps/web/app/organizations/page.tsx, apps/web/app/frameworks/page.tsx, apps/web/app/frameworks/[frameworkId]/page.tsx (listas → DataTable con conteos reales)
  - packages/db/src/domain/service.ts (listFrameworks/listDimensions con joins + count(distinct))
  - packages/sdk-core/src/domain.ts (Framework.dimensionCount, Dimension.indicatorCount/directSubindicatorCount)
  - packages/db/src/__tests__/domain.test.ts (test nuevo de conteos, incluyendo el caso crítico del doble join)
  - Base de datos de producción (Neon): 6 orgs + 1 framework vacío + 11 usuarios de prueba borrados, sin cambio de schema
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md

proximos_pasos:
  - Warning de SSL de Postgres (`sslmode=require` → deprecation warning de `pg`) visible en runtime logs de Vercel desde 2026-08-05 — no bloqueante, pendiente de decisión explícita del usuario antes de tocar `DATABASE_URL` en producción (variable de infraestructura compartida). Última vez que se preguntó, quedó sin responder.
  - Único fallo e2e restante: `public-runtime.spec.ts:56` (comentario TipTap en negrita no persiste tras reload) — bug real ya documentado en `bugs.md` desde 2026-08-13, sin solución todavía (root cause: autosave de montaje del editor pisa la respuesta antes de que termine de hidratar).
  - Pendiente no bloqueante, sigue en BACKLOG.md ("Siguiente"): proveedor de email/SMTP (ADR); TD-001+TD-002 (migraciones versionadas de Drizzle + rama Neon de test aislada); tabla de historial de revisiones de `formSchema`.
  - Al retomar sin un pedido específico: revisar `docs/BACKLOG.md` y `docs/ROADMAP.md` para el siguiente ítem por prioridad.

bloqueos: []

contexto_para_continuar: |
  Sesión con 3 partes: (1) fix de un bug real de SSR en producción, (2)
  arco VS-033..VS-036 — pivote visual a dashboard empresarial ancho
  (sidebar persistente, --content-width 1180px, DataTable con conteos
  reales en las 3 listas administrativas), (3) a pedido del usuario,
  limpieza de la base de producción a 1 usuario/1 org/1 framework seguida
  de una verificación end-to-end completa que encontró y corrigió 2 bugs
  reales pre-existentes del builder (más un test e2e desactualizado).

  La base de datos de producción quedó en su estado más limpio desde que
  el proyecto tiene datos reales: carlos88ban@gmail.com (la cuenta real,
  ahora owner) / CSA 2026 Réplica QA Org / framework "CSA 2026 — Réplica
  QA" (4 dimensiones, 161 subindicadores, 1 evaluación publicada). Todo lo
  demás (verificaciones de slices anteriores, leftovers de e2e) fue
  borrado con confirmación explícita del usuario sobre qué conservar.

  Notas operativas nuevas de esta sesión (además de las ya acumuladas en
  checkpoints anteriores):
  - **Antes de sospechar de un cambio de código por un fallo de e2e
    inexplicable, verificar si hay un `next dev` de una sesión anterior
    todavía escuchando en el puerto 3000** — `playwright.config.ts` usa
    `reuseExistingServer: true`. `netstat -ano | grep :3000` +
    `taskkill //PID <pid> //F` antes de correr el e2e si la sesión viene
    de trabajo largo con múltiples cambios de archivo.
  - **Nunca asumir que un fallo de e2e es pre-existente, una regresión, o
    un bug de producto sin evidencia** — para pre-existente/regresión:
    `git stash` + correr el mismo test contra `main` publicado. Para
    bug-de-producto-vs-test-desactualizado: reproducir el paso a mano en
    el navegador (producción real, no local) antes de tocar código de la
    app — acá el "bug" resultó ser un selector de test que matcheaba el
    botón equivocado por no usar `exact: true`.
  - **Un borrado masivo de datos de producción (múltiples orgs/usuarios)
    es irreversible y de alto impacto** — antes de ejecutar, inventariar
    todo primero (solo lectura), presentar el inventario real al usuario y
    confirmar explícitamente qué se conserva (acá: dos `AskUserQuestion`
    separadas, usuario y framework, porque no había forma de inferirlo —
    ningún framework existente pertenecía a la cuenta real del usuario).
    Dry-run antes de `--write`, siempre.
  - **Cuando un pedido de diseño amplio contradice una decisión ya
    documentada en `docs/`**, no asumir que la documentación estaba
    desactualizada — presentar la disyuntiva explícita al usuario antes de
    tocar nada.
  - Un mockup de Stitch (MCP) vale la pena UNA vez para validar valores de
    diseño antes de comprometerlos en CSS real — no repetirlo por cada
    pantalla que reaplica el mismo patrón ya validado.

  Para retomar sin un pedido específico: leer este archivo, luego
  docs/BACKLOG.md ("Siguiente") y docs/ROADMAP.md para el siguiente ítem
  por prioridad. Comando de verificación: pnpm install && pnpm slice:close.
