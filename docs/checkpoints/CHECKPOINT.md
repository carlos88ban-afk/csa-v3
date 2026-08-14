checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000022
fecha: 2026-08-14
estado: completo
slice_actual: ninguno — VS-039 (referencias de URL por opción) cerrado. Trabajo nuevo pedido por el usuario a partir de un hallazgo de validación en producción, no gap original de AN-001.

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016, VS-017, VS-018, VS-019, VS-020, VS-021, VS-022, VS-023, VS-024, VS-025, VS-026, VS-027, VS-028, VS-029, VS-030, VS-031, VS-032, VS-033, VS-034, VS-035, VS-036, VS-037, VS-038, VS-039]

decisiones_del_dia:
  - **Nota de continuidad**: este CHECKPOINT no se había actualizado tras VS-037/VS-038 (banner: título/contenido separados + estado inicial, y contenido con formato) — ambos ya estaban cerrados y en `CHANGELOG.md`/`BACKLOG.md` al empezar esta sesión. No se reconstruye retroactivamente esa sesión aquí, solo se incorporan a `slices_completados`.
  - **VS-039 — Referencias de URL por opción en `seleccion_unica`/`seleccion_multiple`**: hallazgo de la 4.ª inspección de AN-001 (2026-08-14, validación contra el HTML real de la pregunta 0.1 "Sustainability Reporting Boundaries" del portal S&P): S&P adjunta la fila de referencias de URL pública (máx. 3) DENTRO de cada opción de un radio, no como Elemento `url_publica` separado — el usuario fue explícito en que sigue siendo "una sola pregunta". Spec doc-first ya estaba escrita en `docs/engines/form.md` al empezar esta sesión; esta sesión la implementó completa: `formOption.references?: { maxUrls?: number }` (`packages/sdk-core`, 5 tests nuevos), Builder (botón "Agregar referencias (URL)" por opción en `subindicator-editor.tsx`), Runtime (`OptionReferencesView` en `evaluations/[token]/page.tsx`, mismo patrón de slots que `UrlPublicaView` de VS-017), preview en vivo del Builder (`form-preview.tsx`, slots de solo lectura) y export CSV (sufijo `(Referencias: ...)` en la celda `Respuesta` ya existente, sin fila/columna nueva — ver `docs/engines/export.md`/`form.md` "Notas de implementación").
  - **Verificación manual en navegador real sin credenciales propias**: el asistente no tiene ni puede crear credenciales de login (política de browser automation prohíbe crear cuentas). El usuario inició sesión manualmente con su cuenta real (`carlos88ban@gmail.com`) y avisó cuando estaba listo. Se creó un framework temporal ("VS-039 verificación temporal") en la misma base de producción (sin ambiente de test aislado, ver TD-002) para no tocar el framework real `CSA 2026 — Réplica QA`; verificado Builder + preview + Runtime público + export CSV de punta a punta, y el framework de prueba se borró al terminar (`DELETE /api/frameworks/[id]`, con confirmación explícita del usuario antes del borrado por ser una acción irreversible) — la base de producción quedó exactamente igual que antes de empezar.
  - **Dev server obsoleto detectado de nuevo al arrancar la verificación**: mismo patrón ya documentado en el checkpoint anterior — un `next dev` de una sesión previa seguía escuchando en el puerto 3000. Matado antes de levantar uno fresco (`pnpm --filter @plataforma-csa/web dev`), y detenido de nuevo al terminar la verificación para no dejarlo corriendo entre sesiones.
  - **Validación final en producción real, no solo local**: el usuario aclaró (citando la instrucción original que generó el hallazgo de VS-039) que la validación definitiva debe hacerse contra el sitio desplegado (`https://csa-v3-web.vercel.app`), no un servidor `pnpm dev` — para no saturar el equipo local con procesos de sesiones repetidas. Tras la verificación local, se hizo commit (`292b97b`) + push a `main` con autorización explícita del usuario, se esperó el deploy de Vercel (`READY`), y se repitió la verificación completa (Builder, Runtime público, export CSV) contra el sitio real — mismos resultados. Un segundo framework temporal ("VS-039 verificación producción") quedó creado ahí; el usuario pidió explícitamente NO borrarlo esta vez (a diferencia del framework de prueba local, que sí se borró). Ver `[[feedback_verify_in_production]]` en memoria — este es ahora el criterio de verificación esperado para futuras sesiones.

archivos_modificados:
  - packages/sdk-core/src/form-schema.ts (formOption.references opcional)
  - packages/sdk-core/src/form-schema.test.ts (5 tests nuevos)
  - apps/web/components/subindicator-editor.tsx (Builder: addOptionReferences/removeOptionReferences/updateOptionReferencesMaxUrls + UI)
  - apps/web/components/form-preview.tsx (preview en vivo del Builder: slots de solo lectura)
  - apps/web/app/evaluations/[token]/page.tsx (Runtime: OptionReferencesView)
  - apps/web/app/api/evaluations/[id]/export/route.ts (export CSV: formatOptionReferences)
  - docs/engines/form.md (VS-039 marcado implementado + "Notas de implementación")
  - docs/analysis/csa-sp-global-comparison.md (addendum: VS-039 cerrado el mismo día)
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md

proximos_pasos:
  - Queda en producción un framework de prueba "VS-039 verificación producción" (1 dimensión, 1 subindicador, 1 evaluación publicada) — dejado sin borrar a pedido explícito del usuario tras la verificación final. Borrar cuando el usuario lo pida (`DELETE /api/frameworks/[id]`, mismo endpoint ya usado).
  - Warning de SSL de Postgres (`sslmode=require` → deprecation warning de `pg`) visible en runtime logs de Vercel desde 2026-08-05 — no bloqueante, pendiente de decisión explícita del usuario antes de tocar `DATABASE_URL` en producción. Última vez que se preguntó, quedó sin responder.
  - Único fallo e2e conocido: `public-runtime.spec.ts:56` (comentario TipTap en negrita no persiste tras reload) — bug real ya documentado en `bugs.md` desde 2026-08-13, sin solución todavía.
  - Pendiente no bloqueante, sigue en BACKLOG.md ("Siguiente"): proveedor de email/SMTP (ADR); TD-001+TD-002 (migraciones versionadas de Drizzle + rama Neon de test aislada — habría evitado tener que crear/borrar un framework temporal en producción solo para verificar VS-039); tabla de historial de revisiones de `formSchema`.
  - Al retomar sin un pedido específico: revisar `docs/BACKLOG.md` y `docs/ROADMAP.md` para el siguiente ítem por prioridad.

bloqueos: []

contexto_para_continuar: |
  Sesión de un solo slice: VS-039 (referencias de URL por opción en
  seleccion_unica/seleccion_multiple), gap encontrado en la sesión anterior
  al validar contra el HTML real del portal S&P Global CSA 2026. La spec
  doc-first ya estaba escrita en docs/engines/form.md; esta sesión implementó
  schema + Builder + Runtime + preview + export CSV, con 5 tests nuevos de
  zod, y verificó todo manualmente en navegador real (typecheck/test/build
  en verde, además).

  La base de datos de producción sigue en el mismo estado limpio del
  checkpoint anterior (carlos88ban@gmail.com / CSA 2026 Réplica QA Org /
  framework "CSA 2026 — Réplica QA", 4 dimensiones, 161 subindicadores, 1
  evaluación publicada) — el framework temporal creado para verificar
  VS-039 se borró al terminar.

  Notas operativas nuevas de esta sesión (además de las ya acumuladas en
  checkpoints anteriores):
  - **El asistente no puede crear cuentas de login** (política de browser
    automation) — para verificación manual en navegador que requiere
    sesión, hay que pedirle al usuario que inicie sesión él mismo y avise
    cuando esté listo, en vez de intentar registrar una cuenta de prueba.
  - **Borrar datos de prueba de producción (aunque sean creados en la misma
    sesión) requiere confirmación explícita del usuario antes de ejecutar**
    — no se asume que "es mi framework de prueba, lo borro sin preguntar".
  - Sigue vigente: verificar `netstat -ano | grep :3000` antes de levantar
    `next dev`, por si quedó un servidor de una sesión anterior.

  Para retomar sin un pedido específico: leer este archivo, luego
  docs/BACKLOG.md ("Siguiente") y docs/ROADMAP.md para el siguiente ítem
  por prioridad. Comando de verificación: pnpm install && pnpm slice:close.
