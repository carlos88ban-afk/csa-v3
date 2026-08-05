checkpoint: c9e1a1b0-0004-4a2b-8c3d-00000000000a
fecha: 2026-08-05
estado: en_progreso
slice_actual: VS-013

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012]

decisiones_del_dia:
  - Antes de iniciar VS-012, se validó VS-011 (implementado por otro agente en esta misma sesión): revisión de código (r2.ts, evidence-validation.ts, las 3 rutas — anti-IDOR por prefijo de key, límites de tamaño/tipo), `pnpm slice:close` en verde, y prueba en vivo contra producción de presign/upload/descarga/anti-IDOR/tipo-no-permitido/tamaño-excedido/borrado — todo correcto. Dos gaps de documentación encontrados y corregidos: `key_facts.md` no listaba las 4 env vars de R2; `ROADMAP.md` seguía diciendo "M8 siguiente" pese a que VS-011 (M8) ya estaba cerrado.
  - VS-012 (engine/export) especificado doc-first en engines/export.md. Decisión central: **CSV plano**, no Excel/PDF — `SCOPE.md` pide "exportación básica" explícitamente (BI/analítica fuera de alcance), CSV no requiere librería nueva.
  - A diferencia de `persistence.md`/`evidences.md` (rutas públicas por token), la ruta de exportación es **autenticada y tenant-scoped**: exportar es una acción de revisión del administrador sobre datos de su propia Organización, no algo que el evaluado necesite.
  - `getEvaluation(organizationId, id)` nuevo en `evaluation-service.ts` — faltaba el lookup individual tenant-scoped (solo existían `listEvaluations` por frameworkId y `getEvaluationByToken` sin org).
  - No se agregó ningún contrato zod nuevo en `sdk-core`: la ruta no tiene más input que el `id` de la URL y responde texto plano, no JSON — no hay forma que valga la pena tipar.
  - `engine/export` se agregó a la lista de módulos de `architecture/overview.md` (no existía en el diagrama original) para mantenerlo consistente con `docs/engines/README.md`.

archivos_modificados:
  - docs/engines/export.md, docs/slices/VS-012.md, docs/engines/README.md, docs/architecture/overview.md, docs/ROADMAP.md (spec + resultado doc-first + fix de estado stale)
  - docs/project_notes/key_facts.md (fix: env vars de R2 documentadas)
  - packages/db/src/domain/evaluation-service.ts (getEvaluation nuevo), src/__tests__/evaluation.test.ts (+1 test tenant-scoping)
  - apps/web/app/api/evaluations/[id]/export/route.ts (nuevo)
  - apps/web/app/frameworks/[frameworkId]/page.tsx (link "Exportar CSV")
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md

proximos_pasos:
  - M10/VS-013: Motores fórmula + reglas condicionales (`engine/formula`, `engine/rule`). Especificar antes de implementar (doc-first) — primer motor que introduce lógica condicional/calculada sobre Elementos, afecta `form.md` (tipos `calculado`/`condicional` quedaron pendientes desde VS-007) y el Runtime de `persistence.md`.
  - Pendiente no bloqueante: proveedor de email (BACKLOG), migraciones versionadas de Drizzle (TECH_DEBT TD-001), Playwright (TECH_DEBT TD-003), tabla de historial de revisiones de formSchema si se necesita fuera del contexto de publicación (ver engines/publishing.md).

bloqueos: []

contexto_para_continuar: |
  M0 a M9 completados y verdes (pnpm slice:close: 5 tasks build, 61 tests, 5
  tasks typecheck). Un miembro de la Organización puede exportar en CSV las
  Respuestas de una Evaluación publicada (GET /api/evaluations/[id]/export,
  autenticado — a diferencia del resto de rutas de persistence/evidences que
  son públicas por token). El ciclo completo Builder → Publicar → Responder
  → Exportar está cerrado. La app vive en producción
  (https://csa-v3-web.vercel.app); el flujo de trabajo desde VS-008 verifica
  ahí, no en localhost. No quedan datos de prueba de VS-012 en Neon/R2 (los
  de VS-011 dejados intencionalmente por el agente anterior para revisión
  del usuario, org "Org VS-010", framework "VS-011 Evidencias Prod", siguen
  ahí — no se tocaron).
  Para retomar: leer este archivo, luego docs/BACKLOG.md, luego especificar
  docs/engines/formula.md y/o rule.md antes de VS-013.
  Comando de verificación: pnpm install && pnpm slice:close.
