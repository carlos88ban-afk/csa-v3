checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000014
fecha: 2026-08-06
estado: completo
slice_actual: ninguno — VS-021 cerrado, los 6 gaps de AN-001 quedan resueltos

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016, VS-017, VS-018, VS-019, VS-020, VS-021]

decisiones_del_dia:
  - VS-021 (Numeración automática) cerrado, sexto y último de los 6 gaps de AN-001 priorizados por el usuario el 2026-08-05/06. Con este slice se completa el esfuerzo de cierre de gaps iniciado al comienzo de la sesión.
  - Diseño: numeración **derivada, no persistida** — calculada en tiempo de render a partir del índice del array (mismo criterio que el resto del proyecto: "el índice del array ya es el orden", sin columna `order` redundante). `dimensionNumber`/`indicatorNumber`/`subindicatorNumber` en `packages/sdk-core/src/evaluation.ts`; `questionNumber` en `packages/sdk-core/src/component-registry.ts` (reinicia por Subindicador, solo cuenta Elementos `isQuestion` visibles según `visibleIf`; `instruccion`/`banner` nunca numeran). Cero cambios en `packages/db`.
  - Decisión de alcance explícita: el Builder NO muestra numeración (documentado en `docs/domain/evaluation-hierarchy.md`, sección "Fuera de alcance") — cada página del Builder solo carga su propio nodo + hijos directos, no hermanos/ancestros; numerar ahí exigiría fetches en cascada para un valor bajo.
  - sdk-core delegado a OpenCode (mecánico, contrato ya escrito en el doc antes de delegar); `apps/web` (Runtime público, página de Revisión, export CSV) hecho directamente.
  - Verificado end-to-end en producción con framework de prueba ("VS-021 Test"): 2 Dimensiones (cada una 1 Indicador + 1 Subindicador) y un Subindicador con 3 Elementos (`texto_corto`, `instruccion`, `texto_corto`) diseñado para confirmar que las instrucciones no consumen número y que la numeración de preguntas reinicia por Subindicador.
    - Runtime: árbol de navegación mostró "1 Dim A → 1.1 Ind A1 → 1.1.1 Sub A1a" y "2 Dim B → 2.1 Ind B1 → 2.1.1 Sub B1a"; dentro de Sub B1a, "0.1 Primera pregunta" / instrucción sin número / "0.2 Segunda pregunta".
    - Página de Revisión: mismo árbol y numeración de preguntas confirmados por screenshot.
    - Export CSV: columna "Número" con valores "0.1"/"0.2" correctos para las dos preguntas de Sub B1a.
    - Datos de prueba limpiados (evaluación revocada/eliminada, framework "VS-021 Test" eliminado vía `DELETE /api/frameworks/{id}`).
  - Documento de análisis `docs/analysis/csa-sp-global-comparison.md` actualizado: los 6 gaps de la tabla de mapeo marcados ✅ resueltos con referencia a su slice (VS-016 a VS-021), sección "Veredicto" y "Siguientes pasos" reescritas para reflejar el cierre completo.

archivos_modificados:
  - docs/domain/evaluation-hierarchy.md (spec doc-first "Numeración automática (VS-021)" + sección "Fuera de alcance" para el Builder)
  - docs/engines/form.md (sección "Numeración automática de preguntas (VS-021)")
  - packages/sdk-core/src/evaluation.ts (dimensionNumber, indicatorNumber, subindicatorNumber)
  - packages/sdk-core/src/component-registry.ts (questionNumber)
  - packages/sdk-core/src/evaluation.test.ts, component-registry.test.ts (tests nuevos)
  - apps/web/app/evaluations/[token]/page.tsx (árbol de navegación, breadcrumb-mini, h1, labels de pregunta con prefijo de número)
  - apps/web/app/frameworks/[frameworkId]/evaluations/[evaluationId]/review/page.tsx (numeración en h2/h3/h4 y lista de preguntas)
  - apps/web/app/api/evaluations/[id]/export/route.ts (columna "Número" en CSV)
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md
  - docs/analysis/csa-sp-global-comparison.md (los 6 gaps marcados resueltos)

proximos_pasos:
  - Ninguno relacionado a AN-001 — los 6 gaps quedan cerrados y verificados en producción (https://csa-v3-web.vercel.app).
  - Pendiente no bloqueante, sigue en BACKLOG.md ("Siguiente"): proveedor de email/SMTP (ADR) para invitación automática; TD-001+TD-002 (migraciones versionadas de Drizzle + rama Neon de test aislada); tabla de historial de revisiones de `formSchema` si se necesita reconstruir historial fuera de una publicación.
  - Al retomar trabajo sin un pedido específico del usuario, revisar `docs/ROADMAP.md` y `docs/BACKLOG.md` para el siguiente ítem por prioridad.

bloqueos: []

contexto_para_continuar: |
  AN-001 (análisis S&P Global CSA 2026, docs/analysis/csa-sp-global-comparison.md)
  identificó 6 gaps aditivos sobre engine/form; el usuario los priorizó completos
  el 2026-08-05/06 con la directiva explícita de implementar todo lo necesario
  para cada gap, sin recortes ni versiones mínimas. VS-016 a VS-021 cerrados,
  verificados en producción (https://csa-v3-web.vercel.app) y documentados
  (CHANGELOG/issues/BACKLOG/análisis AN-001 actualizado). No queda trabajo
  pendiente de este esfuerzo.

  Notas operativas acumuladas durante la sesión (útiles si se repiten):
  - Si claude-in-chrome no conecta, verificar que `claude.exe
    --chrome-native-host` siga vivo antes de escalar (reinicio de Chrome
    suele bastar).
  - Si un push no genera deployment en Vercel (ni "Canceled" en el dashboard),
    ver el incidente detallado en el CHANGELOG de VS-020 — commit vacío +
    "Redeploy" manual sobre ESE commit vacío resuelve.
  - Al copiar tokens/URLs desde la UI para navegar con claude-in-chrome,
    extraer el valor exacto vía `javascript_tool`
    (`[...document.querySelectorAll('a')].map(a => a.href)`) en vez de
    transcribir desde un screenshot — evita errores de OCR visual en
    caracteres ambiguos (I/l, 0/O).

  Para retomar sin un pedido específico: leer este archivo, luego
  docs/BACKLOG.md ("Siguiente") y docs/ROADMAP.md para el siguiente ítem
  por prioridad.
  Comando de verificación: pnpm install && pnpm slice:close.
