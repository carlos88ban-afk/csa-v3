checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000013
fecha: 2026-08-06
estado: en_progreso
slice_actual: ninguno — VS-020 cerrado, siguiente y último es VS-021 (numeración automática)

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016, VS-017, VS-018, VS-019, VS-020]

decisiones_del_dia:
  - VS-020 (Save/Cancel/Reset) cerrado, quinto de los 6 gaps de AN-001. Usuario confirmó antes de diseñar: Cancel y Reset tienen el mismo efecto (volver al último guardado) — se implementaron como una sola función (`handleCancelOrReset`) expuesta en dos botones, evitando duplicar lógica sin necesidad.
  - Diseño: `lastSavedBySub` (useRef, no useState — caché de lectura para los botones, no debe re-renderizar por sí sola) trackea la última foto de `answers` confirmada por el servidor por Subindicador. `Guardar` fuerza el autosave pendiente ya (cancela el debounce, llama el mismo PUT). `Cancelar`/`Restablecer` revierten el Subindicador activo a esa foto y cancelan cualquier autosave pendiente para que no la sobreescriba. Sin cambios en sdk-core/packages/db — puramente estado de cliente, el slice más simple de los 6 gaps en superficie de código.

  - **Incidente real de infraestructura durante el despliegue de este slice** (documentado en detalle porque puede repetirse):
    - El push del commit de código de VS-020 (`7a7e4d8`) llegó correctamente a GitHub (confirmado con `git fetch` + `git log origin/main`) pero **nunca generó un deployment en Vercel** — ni siquiera con estado "Canceled" (se revisó con los 7 estados de filtro visibles en el dashboard). Todos los pushes anteriores de la sesión habían disparado un build en segundos.
    - Diagnóstico paso a paso: (1) confirmado que el repo seguía conectado en Settings→Git (`carlos88ban-afk/csa-v3`, conectado hace 2 días); (2) confirmado Root Directory = `apps/web` con "Include files outside the root directory" habilitado y "Skip deployments when no changes to root directory or dependencies" habilitado — un heurístico legítimo del proyecto, no la causa (el commit sí tocaba `apps/web`); (3) un primer intento de "Redeploy" desde el dashboard solo reconstruyó el commit VIEJO (el redeploy re-ejecuta un deployment ya existente, no apunta al HEAD real de la rama); (4) se hizo `git commit --allow-empty` + push para forzar un evento nuevo — este SÍ generó un deployment (confirma que el webhook en general funcionaba), pero quedó en estado "Canceled" porque un commit vacío no toca `apps/web` (el heurístico de "skip" actuó correctamente sobre ESE commit); (5) usando el botón "Redeploy" sobre ESE deployment cancelado (mismo árbol de archivos que el HEAD real, ya que un commit vacío no cambia el árbol), se generó un build real que sí compiló y quedó `READY` como el deployment de producción activo.
    - Causa raíz más probable: pérdida puntual de la entrega del webhook de GitHub→Vercel para un solo push (no un problema de configuración persistente — el mismo mecanismo funcionó normalmente antes y después). No se encontró una causa determinística más profunda accesible desde las herramientas disponibles (sin CLI de Vercel/GitHub instalado en este entorno; los MCP no exponen los webhook deliveries de GitHub ni logs internos de Vercel más allá de la lista de deployments).
    - Diagnóstico hecho navegando el dashboard real de Vercel con claude-in-chrome (Settings→Git, Settings→Build and Deployment, Deployments con filtro de estados) a pedido explícito del usuario, ya que las herramientas MCP de Vercel no exponen esta información.
    - Si se repite: no asumir que es un problema del código. Revisar primero si el commit aparece en la lista de Deployments con CUALQUIER estado (incluido Canceled, que por defecto viene oculto en el filtro). Si no aparece en absoluto, es un push cuyo webhook no llegó — la solución que funcionó fue: commit vacío para generar un nuevo evento (aunque quede Canceled por el heurístico de "sin cambios"), luego "Redeploy" manual sobre ESE deployment cancelado (su árbol de archivos es el HEAD real).
  - Verificado end-to-end en producción con framework de prueba ("VS-020 Test", Org VS-010): los tres botones deshabilitados sin cambios pendientes; escribir los habilita; `Cancelar` revierte al último valor guardado (probado escribiendo y cancelando ANTES de que corriera el autosave de 1.5s, con doble intento para superar la latencia de las herramientas de automatización); `Restablecer` con el mismo comportamiento; `Guardar` dispara "Guardando…" de inmediato (sin esperar el debounce) y persiste tras recargar. Datos de prueba limpiados.

archivos_modificados:
  - docs/engines/persistence.md (spec doc-first "Botones Save/Cancel/Reset explícitos VS-020")
  - apps/web/app/evaluations/[token]/page.tsx (lastSavedBySub, doSave extraído, handleSave, handleCancelOrReset, dirty)
  - apps/web/app/globals.css (.runtime-topbar__actions)
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md

proximos_pasos:
  - Siguiente y último: VS-021 — numeración automática (árbol + preguntas), gap 6 de AN-001 y cierre de los 6 gaps priorizados por el usuario. Numeración derivada por posición (Dimensión=1,2,3; Indicador=1.1,1.2; Subindicador=1.1.1; preguntas dentro=0.1,0.2 según el doc de análisis) — NO persistida, calculada en Builder y Runtime a partir del orden del array (mismo criterio que el resto del proyecto: "sin campo `order` redundante", el índice del array ya es el orden). Diseñar doc-first en docs/domain/evaluation-hierarchy.md y docs/engines/form.md antes de tocar código.
  - Al cerrar VS-021 se completan los 6 gaps de AN-001 (docs/analysis/csa-sp-global-comparison.md) — actualizar también ese documento marcando los 6 como resueltos, no solo el CHANGELOG/BACKLOG habituales.
  - Pendiente no bloqueante, sigue en BACKLOG.md: TD-001+TD-002 (migraciones versionadas + rama Neon de test), proveedor de email (ADR), tabla de historial de revisiones de formSchema si se necesita.

bloqueos: []

contexto_para_continuar: |
  AN-001 (análisis S&P) identificó 6 gaps aditivos sobre engine/form; el
  usuario los priorizó completos el 2026-08-05/06. VS-016 a VS-020 cerrados
  y verificados en producción (https://csa-v3-web.vercel.app). Queda SOLO
  VS-021 (numeración automática) para completar los 6 gaps.
  Mismo proceso: doc-first → código (OpenCode si es mecánico, directo si
  es de mayor juicio) → verificar en producción con claude-in-chrome →
  limpiar datos de prueba → cerrar (CHANGELOG/issues/CHECKPOINT/BACKLOG).
  Notas operativas acumuladas esta sesión:
  - Si claude-in-chrome no conecta, verificar que `claude.exe
    --chrome-native-host` siga vivo antes de escalar (reinicio de Chrome
    suele bastar).
  - Si un push no genera deployment en Vercel (ni "Canceled"), ver el
    incidente detallado arriba — commit vacío + Redeploy manual sobre ese
    commit vacío resuelve.
  Para retomar: leer este archivo, luego docs/BACKLOG.md ("Siguiente"),
  empezar VS-021 con docs/analysis/csa-sp-global-comparison.md como
  referencia del gap. Al cerrarlo, marcar los 6 gaps de AN-001 como
  resueltos en ese documento también.
  Comando de verificación: pnpm install && pnpm slice:close.
