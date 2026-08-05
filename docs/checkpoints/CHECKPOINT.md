checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000009
fecha: 2026-08-05
estado: en_progreso
slice_actual: VS-012

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011]

decisiones_del_dia:
  - VS-011 (engine/evidences) especificado doc-first en engines/evidences.md. Decisión central: presigned URLs de R2 — el navegador sube el binario con PUT directo a R2 (URL firmada por el servidor, 5 min) y descarga con GET firmado; los binarios nunca pasan por la función serverless de Vercel (límite Hobby ~4.5MB). Claves `evaluations/{evaluationId}/{uuid}` con anti-IDOR por prefijo.
  - Octavo tipo de elemento `evidencia` (isQuestion, config maxFiles/maxSizeMb/acceptedTypes) + `evidenceRef` en `answerValue` — las refs persisten en el jsonb de `response` sin tabla nueva.
  - Infra R2 en producción: env vars en `.env` y Vercel (production), bucket `plataforma-csa-files` con política CORS (hallazgo: sin CORS el PUT del navegador falla con "Failed to fetch" — configurado vía API de Cloudflare con el token CFAT del usuario, documentado como requisito de operación en la spec).
  - Deploy de producción vía GitHub Integration (commit fc65c54 push a main) — el deploy CLI desde la raíz del monorepo excede el límite de upload de 100MB y el proyecto tiene rootDirectory=apps/web; el flujo git es el correcto.
  - Verificación en producción de VS-011 usó la sesión ya activa (`ui-verify@example.com`, org "Org VS-010") en la ventana nueva de Chrome (puerto 9223); la UI se condujo con evaluación JS desde CDP (el snapshot de accesibilidad no expone el árbol). Sin contraseñas escritas (regla de seguridad sin excepciones).

archivos_modificados:
  - docs/engines/evidences.md, docs/slices/VS-011.md, docs/engines/README.md, docs/ROADMAP.md (spec + resultado doc-first)
  - packages/sdk-core/src/form-schema.ts, component-registry.ts, response.ts (+ tests: 40 tests)
  - packages/db/src/__tests__/response.test.ts (test de integración evidencias: 20 tests)
  - apps/web/lib/r2.ts, lib/evidence-validation.ts (nuevos)
  - apps/web/app/api/public/evaluations/[token]/evidences/{presign,download-url,route}.ts (nuevos)
  - apps/web/app/evaluations/[token]/page.tsx (EvidenceView), apps/web/lib/api-client.ts (método del con body)
  - apps/web/.../subindicators/[subindicatorId]/page.tsx (caso evidencia en Builder), apps/web/app/globals.css (.runtime-evidence*)
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md, docs/adr/0003 (Proposed → Accepted)
  - .env (+4 vars R2), .gitignore (+.vercel), apps/web/.gitignore (nuevo: .vercel/.env*)

proximos_pasos:
  - M9/VS-012: Exportación de resultados (probable: CSV/Excel de Respuestas por Evaluación) — especificar antes de implementar (doc-first). Ver docs/ROADMAP.md.
  - Pendiente no bloqueante: proveedor de email (BACKLOG), migraciones versionadas de Drizzle (TECH_DEBT TD-001), Playwright (TECH_DEBT TD-003), tabla de historial de revisiones de formSchema si se necesita fuera del contexto de publicación (ver engines/publishing.md).

bloqueos: []

contexto_para_continuar: |
  M0 a M8 completados y verdes (pnpm slice:close: build, 60 tests, typecheck).
  El Runtime de respuesta ya permite adjuntar Evidencias: el navegador sube
  archivos directo a Cloudflare R2 con presigned URLs (PUT/GET firmadas de 5
  min) y la Respuesta persiste solo las refs (key/name/size/mimeType) en el
  jsonb de la tabla `response` — los binarios nunca pasan por Vercel. El
  bucket `plataforma-csa-files` tiene CORS configurado para vercel y
  localhost. La app vive en producción (https://csa-v3-web.vercel.app); el
  flujo de trabajo desde VS-008 verifica ahí, no en localhost. Deploy vía
  GitHub Integration (push a main); las 4 env vars R2 están en Vercel
  production. Quedan en producción los datos de prueba de VS-011 (org
  "Org VS-010": framework "VS-011 Evidencias Prod" publicado, sin
  evidencias) para revisión del usuario.
  Para retomar: leer este archivo, luego docs/BACKLOG.md, luego especificar
  el motor de M9 antes de VS-012.
  Comando de verificación: pnpm install && pnpm slice:close.
