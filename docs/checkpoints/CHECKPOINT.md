checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000020
fecha: 2026-08-14
estado: completo
slice_actual: ninguno — arco VS-033..VS-036 cerrado (pivote visual a dashboard empresarial ancho). Trabajo nuevo pedido por el usuario, no gap de AN-001.

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016, VS-017, VS-018, VS-019, VS-020, VS-021, VS-022, VS-023, VS-024, VS-025, VS-026, VS-027, VS-028, VS-029, VS-030, VS-031, VS-032, VS-033, VS-034, VS-035, VS-036]

decisiones_del_dia:
  - **Nota de continuidad**: este CHECKPOINT no se actualizó tras VS-031 (workspace split-view del builder) ni VS-032 (editor amigable) — ambos ya estaban cerrados y en producción al empezar esta sesión (confirmado por `git log` y `docs/CHANGELOG.md`), simplemente el checkpoint anterior (2026-08-07) quedó desactualizado. No se reconstruye retroactivamente esa sesión aquí; `docs/CHANGELOG.md` y `docs/BACKLOG.md` sí tienen el detalle completo de VS-031/032.
  - **Punto de partida de esta sesión**: bug en producción encontrado al pedir una revisión general — `ReferenceError: window is not defined` en SSR de `/frameworks/[frameworkId]/builder` (un `useState(() => window.matchMedia(...))` corría durante el render de servidor pese a ser un componente `"use client"`). Diagnosticado con `mcp__plugin_vercel_vercel__get_runtime_errors` (no solo `list_deployments` — el deployment estaba "READY" pero la ruta seguía rota en runtime). Corregido, commiteado (`a8e7fec`) y verificado en producción antes de seguir con el resto de la sesión.
  - **Pivote de diseño (VS-033..VS-036)**: el usuario pidió mejorar la calidad visual de toda la plataforma "basado en diseño de plataformas empresariales" y verificar espacio desaprovechado. Auditoría con capturas reales confirmó que `.page` (840px centrado) dejaba ~38% del ancho vacío en un viewport de 1366px. Se determinó que esa columna angosta era una **decisión ya documentada deliberadamente** en `docs/architecture/design-system.md` ("estilo ledger", no dashboard) — no un descuido. Se presentó la disyuntiva al usuario (`AskUserQuestion`): mantener la columna y densificar contenido, vs. pivotar a dashboard ancho tipo Salesforce/Workday. Eligió el pivote, y dentro de él, explícitamente: (a) agregar sidebar izquierdo persistente (no solo ensanchar contenido), (b) incluir conteos reales en las tablas nuevas desde el inicio (no diferirlos a un backlog futuro).
  - Por el tamaño del cambio (toca el shell global, backend con nuevas queries de conteo, y contradice una decisión de diseño ya documentada), se usó **Plan Mode** antes de tocar código — 2 subagentes Explore (inventario de layout de las 14 páginas + qué datos ya existían sin tocar backend) y 1 subagente Plan (diseño detallado de las 4 slices) antes de escribir el plan final. Plan guardado en `D:\Usuarios\PM75161698\.claude\plans\memoized-squishing-shell.md`.
  - **Stitch MCP usado deliberadamente una sola vez**: mockup de la vista Frameworks (sidebar + tabla) con la paleta real del proyecto, para validar `--sidebar-width`/`--content-width` antes de comprometerlos en CSS — no se repitió por página (una vez validado el patrón, las demás son reaplicaciones mecánicas del mismo componente).
  - **Verificación e2e con hallazgo importante sobre servidores de dev obsoletos**: la primera corrida completa del e2e tuvo 4 fallos, incluyendo 2 que parecían nuevos (textos no encontrados en `/evaluations/[token]`). Investigado: un `next dev` de una sesión ANTERIOR seguía escuchando en el puerto 3000 y Playwright lo reutilizó (`reuseExistingServer: true`) sirviendo código desactualizado. Matado el proceso viejo (`taskkill`) y recorrido con un servidor fresco: esos 2 fallos desaparecieron. **Lección**: si un e2e falla de forma que no tiene sentido con el diff, verificar primero si hay un `next dev` viejo en el puerto antes de sospechar del código nuevo.
  - **Confirmación rigurosa de que los 2 fallos restantes son pre-existentes**: en vez de asumirlo, se hizo `git stash` de todos los cambios de la sesión (moviendo aparte los 3 archivos nuevos sin trackear) y se corrió el mismo test contra `main` tal cual estaba publicado — mismos 2 fallos, mismo punto exacto de falla. Confirmado no-regresión con evidencia, no con suposición. Uno ya estaba documentado en `bugs.md` (autosave del comentario TipTap); el otro (wizard del builder no reconoce una Dimensión recién creada como seleccionada) es un hallazgo nuevo, registrado en `bugs.md` pero no arreglado — es un bug de VS-032, fuera de alcance de este pivote de layout.

archivos_modificados:
  - apps/web/app/frameworks/[frameworkId]/builder/page.tsx (fix SSR window, sesión previa a VS-033)
  - docs/project_notes/bugs.md (2 entradas nuevas: SSR window, wizard builder)
  - docs/architecture/design-system.md (sección Layout reescrita — pivote a dashboard ancho, doc-first antes del código)
  - apps/web/app/globals.css (--content-width 840→1180px, --sidebar-width nuevo, .page--wide 960→1280px, .app-shell/.app-sidebar__* nuevas, .data-table* nuevas)
  - apps/web/components/app-header.tsx (eliminado) → apps/web/components/app-shell.tsx, app-sidebar.tsx (nuevos)
  - apps/web/components/data-table.tsx (nuevo — DataTable<T> genérico)
  - apps/web/app/layout.tsx (monta AppShell)
  - apps/web/app/organizations/page.tsx, apps/web/app/frameworks/page.tsx, apps/web/app/frameworks/[frameworkId]/page.tsx (listas → DataTable con conteos reales)
  - packages/db/src/domain/service.ts (listFrameworks/listDimensions con joins + count(distinct))
  - packages/sdk-core/src/domain.ts (Framework.dimensionCount, Dimension.indicatorCount/directSubindicatorCount)
  - packages/db/src/__tests__/domain.test.ts (test nuevo de conteos, incluyendo el caso crítico del doble join)
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md

proximos_pasos:
  - Verificar en producción real (Chrome/Playwright a 1366×768) tras el deploy: `/frameworks`, `/frameworks/[id]`, `/organizations`, `/login` (angosto intacto), colapso del sidebar en `@media (max-width: 860px)`.
  - Bug nuevo sin arreglar, registrado en `bugs.md` (2026-08-14): el wizard del builder no reconoce una Dimensión recién creada como seleccionada tras navegar directo a `/builder?s=<dimId>` — root cause no investigado a fondo, sospecha inicial es `wizardStep`/`wizardSession` desincronizado de `selectedId`. Bloquea que `builder-publish.spec.ts` pase limpio.
  - Warning de SSL de Postgres (`sslmode=require` → deprecation warning de `pg`) visible en los runtime logs de Vercel desde el 2026-08-05 — no bloqueante, pendiente de decisión explícita del usuario antes de tocar `DATABASE_URL` en producción (variable de infraestructura compartida).
  - Pendiente no bloqueante, sigue en BACKLOG.md ("Siguiente"): proveedor de email/SMTP (ADR); TD-001+TD-002 (migraciones versionadas de Drizzle + rama Neon de test aislada); tabla de historial de revisiones de `formSchema`.
  - Al retomar sin un pedido específico: revisar `docs/BACKLOG.md` y `docs/ROADMAP.md` para el siguiente ítem por prioridad.

bloqueos: []

contexto_para_continuar: |
  Arco VS-033..VS-036 (pivote visual a dashboard empresarial ancho) cerrado:
  sidebar izquierdo persistente, --content-width 840→1180px, y las 3 listas
  administrativas principales (organizaciones, frameworks, dimensiones) con
  DataTable + conteos reales en vez de listas de viñetas sin metadata.

  Fue trabajo nuevo pedido por el usuario, no un gap de AN-001. Requirió
  actualizar una decisión de diseño ya documentada (columna angosta ~840px,
  "estilo ledger") — se hizo doc-first, reescribiendo
  docs/architecture/design-system.md antes de tocar código, siguiendo la
  regla rectora del proyecto.

  Antes de este arco, la sesión arrancó arreglando un bug real en
  producción (VS-032 rota por un ReferenceError: window is not defined en
  SSR) — ver decisiones_del_dia para el diagnóstico completo.

  Notas operativas nuevas de esta sesión (además de las ya acumuladas en
  checkpoints anteriores):
  - **Antes de sospechar de un cambio de código por un fallo de e2e
    inexplicable, verificar si hay un `next dev` de una sesión anterior
    todavía escuchando en el puerto 3000** — `playwright.config.ts` usa
    `reuseExistingServer: true`, así que reutiliza cualquier servidor viejo
    sin detectar que sirve código desactualizado. `netstat -ano | grep
    :3000` + `taskkill //PID <pid> //F` antes de correr el e2e si la sesión
    viene de un trabajo largo con múltiples cambios de archivo.
  - **Nunca asumir que un fallo de e2e es pre-existente o es una regresión
    sin evidencia** — `git stash` (moviendo aparte archivos nuevos sin
    trackear antes de stashear, ya que `git stash push <pathspec>` sin
    `-u` no los incluye) + correr el mismo test contra el código ya
    publicado es rápido y da una respuesta definitiva en vez de una
    suposición.
  - **Cuando un pedido de diseño amplio ("mejorar toda la plataforma")
    contradice una decisión ya documentada en `docs/`**, no asumir que la
    documentación estaba desactualizada — presentarle la disyuntiva
    explícita al usuario (`AskUserQuestion`) antes de tocar nada, ya que
    puede ser una decisión deliberada con una razón de negocio real detrás
    (acá lo era: "estilo ledger" documentado en VS-006).
  - Un mockup de Stitch (MCP) vale la pena UNA vez para validar valores de
    diseño (anchos, patrón visual) antes de comprometerlos en CSS real —
    pero no repetirlo por cada pantalla que reaplica el mismo patrón ya
    validado; no tiene visibilidad de los datos reales del backend.

  Para retomar sin un pedido específico: leer este archivo, luego
  docs/BACKLOG.md ("Siguiente") y docs/ROADMAP.md para el siguiente ítem
  por prioridad. Comando de verificación: pnpm install && pnpm slice:close.
