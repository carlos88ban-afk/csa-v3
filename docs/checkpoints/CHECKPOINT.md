checkpoint: c9e1a1b0-0004-4a2b-8c3d-00000000000b
fecha: 2026-08-05
estado: en_progreso
slice_actual: VS-014

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013]

decisiones_del_dia:
  - VS-013 (engine/formula + engine/rule) especificado doc-first en engines/formula.md y engines/rule.md — cierra los dos tipos de Elemento pendientes desde M4 (VS-007): `calculado` y visibilidad condicional.
  - Parser/evaluador de fórmulas a mano (tokenizer + recursivo-descendente, sin librería) — mismo principio ya aplicado en todo el proyecto (registry a mano en VS-008, CSV a mano en VS-012).
  - `visibleIf` se modela como propiedad opcional de CUALQUIER Elemento (`formElementBase`), no como un Elemento contenedor `condicional` — ese enfoque literal (tal como aparece listado en ubiquitous-language.md) hubiera requerido anidamiento y roto el modelo plano `elements: FormElement[]` que sostiene Builder/Runtime/progreso/export desde form.md.
  - Simplificación deliberada en rule.md: una condición se evalúa siempre contra la respuesta *guardada* del Elemento referenciado, nunca contra si ese Elemento está visible — evita por completo el problema de dependencias cíclicas de visibilidad sin necesitar código para resolverlo (no está pedido en v1).
  - El valor de un `calculado` se autoguarda como una respuesta más (mismo camino que cualquier pregunta) en vez de inventar un concepto de "valor derivado" separado — reutiliza el 100% de progreso/exportación/persistencia ya construidos y verificados, sin tocarlos más que agregando un filtro de visibilidad a cada uno.
  - Detección de ciclos de fórmulas (DFS blanco/gris/negro sobre el subgrafo calculado→calculado) y autorreferencia de `visibleIf` centralizadas en un único `.superRefine()` de `formSchema` — un solo punto de validación cruzada entre Elementos, no dos.
  - Se delegó a dos subagentes de OpenCode en paralelo la implementación de `packages/sdk-core/src/formula.ts` y `rule.ts` (piezas mecánicas con spec completa ya escrita) — resultado correcto salvo un error de tipos menor (unión de arrays en `.includes()`), corregido directamente. La integración cruzada (`form-schema.ts`) y toda la UI (Builder + Runtime + export) se hicieron directamente por ser la parte de mayor juicio.

archivos_modificados:
  - docs/engines/formula.md, docs/engines/rule.md, docs/slices/VS-013.md, docs/engines/README.md, docs/architecture/overview.md, docs/ROADMAP.md (spec + resultado doc-first)
  - packages/sdk-core/src/formula.ts, formula.test.ts (nuevos)
  - packages/sdk-core/src/rule.ts, rule.test.ts (nuevos)
  - packages/sdk-core/src/response.ts (+hasAnswer)
  - packages/sdk-core/src/form-schema.ts (+calculado, +visibleIf, +superRefine de ciclos/autorreferencia), form-schema.test.ts (+tests)
  - packages/sdk-core/src/component-registry.ts (+calculado), src/index.ts (exports)
  - apps/web/.../subindicators/[subindicatorId]/page.tsx (id visible, editor de visibleIf, config de fórmula con validación inline)
  - apps/web/app/evaluations/[token]/page.tsx (filtra por isElementVisible en progreso/render, CalculadoView de solo lectura con autosave)
  - apps/web/app/api/evaluations/[id]/export/route.ts (filtra por isElementVisible)
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md

proximos_pasos:
  - M11/VS-014: Permisos (RBAC: dueño/editor/evaluador). Especificar docs/engines/permission.md antes de implementar (doc-first) — hasta ahora cualquier member/owner de la Organización puede todo (documentado como límite intencional en organization-user.md/evaluation-hierarchy.md desde M2).
  - Pendiente no bloqueante: proveedor de email (BACKLOG), migraciones versionadas de Drizzle (TECH_DEBT TD-001), Playwright (TECH_DEBT TD-003), tabla de historial de revisiones de formSchema si se necesita fuera del contexto de publicación (ver engines/publishing.md).

bloqueos: []

contexto_para_continuar: |
  M0 a M10 completados y verdes (pnpm slice:close: 5 tasks build, 144 tests,
  5 tasks typecheck). El Form Engine ya soporta los 9 tipos de Elemento
  completos: las 5 preguntas base + instruccion/banner (M4), evidencia (M8)
  y ahora calculado + visibilidad condicional (M10) — el modelo de
  formSchema documentado en form.md queda cerrado según lo planeado
  originalmente en M4. La app vive en producción
  (https://csa-v3-web.vercel.app); el flujo de trabajo desde VS-008 verifica
  ahí, no en localhost. No quedan datos de prueba de VS-013 en Neon (los de
  VS-011 dejados intencionalmente por el agente anterior para revisión del
  usuario, org "Org VS-010", framework "VS-011 Evidencias Prod", siguen ahí
  — no se tocaron).
  Para retomar: leer este archivo, luego docs/BACKLOG.md, luego especificar
  docs/engines/permission.md antes de VS-014.
  Comando de verificación: pnpm install && pnpm slice:close.
