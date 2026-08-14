checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000025
fecha: 2026-08-14
estado: completo
slice_actual: ninguno — VS-041 (ajustes UX en referencias de URL) cerrado y desplegado a producción.

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016, VS-017, VS-018, VS-019, VS-020, VS-021, VS-022, VS-023, VS-024, VS-025, VS-026, VS-027, VS-028, VS-029, VS-030, VS-031, VS-032, VS-033, VS-034, VS-035, VS-036, VS-037, VS-038, VS-039, VS-040, VS-041]

decisiones_del_dia:
  - **VS-040 — Campos embebidos en sub-opciones + exclusividad configurable**: 2.º hallazgo sobre la misma pregunta 0.1 de S&P que originó VS-039, mismo día. El usuario pidió analizar la sub-pregunta anidada "OverallSustainabilityDisclosure" (revelada bajo la opción "Sí, la empresa informa..."). Dos gaps: (A) una sub-opción trae su propio `<select>` embebido (rangos de % de ingresos) — pedido explícito; (B) hallazgo adicional en el mismo HTML: el grupo es `type="radio"` (excluyente), pero el Runtime siempre renderizaba checkbox (decisión de VS-016 documentada como "siempre selección múltiple, mismo patrón que S&P", que este HTML real contradice). Presentado el análisis completo al usuario con `AskUserQuestion` (2 preguntas: corregir Gap B en el mismo slice sí/no, alcance del field select-only vs select+texto/número) antes de escribir la spec — ambas respondidas afirmativamente/ampliado.
  - **Implementación**: spec doc-first en `docs/engines/form.md` primero (regla rectora). `packages/sdk-core`: `subOption` gana `field?: {type: "seleccion_desplegable"|"texto_corto"|"numero", ...}` y `references?` (mismo campo que `formOption`, ahora también a nivel de sub-opción); `formOption` gana `subOptionsExclusive?: boolean` (default `false`, compatible hacia atrás). 10 tests nuevos. Builder (`subindicator-editor.tsx`): checkbox "Sub-opciones excluyentes" + selector "Agregar campo…" por sub-opción con su configuración. Runtime (`evaluations/[token]/page.tsx`): `SubOptionsView` gana prop `exclusive` (radio vs checkbox, solo nivel 1) + `SubOptionFieldView` nuevo. Preview del Builder (`form-preview.tsx`): mismo comportamiento, ahora interactivo (a diferencia de `url_publica`, un campo simple sí se simula funcionalmente). Export CSV: sub-opción marcada con su `field` resuelto se anexa a la celda `Respuesta` tras un `—`.
  - **Bug preexistente corregido de paso**: al implementar la exclusividad explícita, se encontró que el preview del Builder (`PreviewSubOptions`) trataba las sub-opciones de nivel 1 como radio por una heurística fija (`level === 1`) desde VS-016, mientras el Runtime real siempre las trataba como checkbox — inconsistencia sin impacto en datos (el preview nunca persiste), documentada en `docs/project_notes/bugs.md` y corregida: ambos componentes ahora leen el mismo campo explícito `subOptionsExclusive`.
  - **Verificación manual en navegador local**: framework temporal "VS-040 verificación temporal" creado (sin tocar "VS-039 verificación producción", dejado intencionalmente de la sesión anterior). Verificado Builder (checkbox exclusividad + campo select con 2 opciones de rango), preview en vivo, Runtime público (confirmada la exclusividad REAL: seleccionar "Todas las actividades" desmarca "El siguiente % de ingresos cubierto" y oculta su `<select>`; el valor del select persiste al volver a seleccionar), y export CSV (`"Sí, la empresa informa — El siguiente % de ingresos cubierto (0-25%)"`). `pnpm typecheck`/`build`/`test` en verde.
  - **Deploy a producción + verificación explícita de persistencia real**: commit (`12ef05a`) + push a `main` (con un `git push` que colgó por red la primera vez — reintentado en background hasta completar), deploy a Vercel esperado hasta `READY` (`dpl_DMvduN1FM2S3pab4j7zK2NRnufAC`). El usuario pidió expresamente confirmar que las respuestas nuevas "no sean solo decorativas" — se cargó el Runtime público **desde cero** en `https://csa-v3-web.vercel.app` (servidor distinto al que recibió las respuestas) usando el mismo token de evaluación ya respondido en local (misma base de datos real, sin ambiente de test aislado — ver TD-002): la opción, la sub-opción excluyente marcada y el valor del `<select>` embebido ("0-25%") aparecieron exactamente iguales al recargar, confirmando persistencia real en la base de datos vía el mecanismo de autosave genérico existente (no un caso especial). Export CSV confirmado idéntico en producción. Framework de prueba "VS-040 verificación temporal" borrado al terminar (`DELETE /api/frameworks/[id]`, a pedido explícito del usuario — a diferencia de "VS-039 verificación producción", que se dejó intacto).
  - **VS-041 — Ajustes UX en referencias de URL**: el usuario probó VS-039/VS-040 en producción y reportó dos problemas de presentación (sin cambio de schema): (1) el bloque de referencias (URL) se renderizaba antes que las sub-opciones anidadas cuando una sub-opción tenía ambas — corregido a `field → subOptions → references`; (2) los campos de URL crecían automáticamente al escribir, sin botón explícito, y el preview del Builder mostraba todos los `maxUrls` slots de golpe en solo lectura — nuevo `UrlSlotsView`/`PreviewUrlList` compartidos, arrancan en 1 slot, botón "Agregar URL" hasta `maxUrls`. Commit `9cfe73e`, deploy a Vercel, verificado en local y producción real (framework temporal creado y borrado con confirmación explícita en ambas rondas — salvo un lapso puntual en la ronda local, corregido de inmediato en la ronda de producción).
  - **Lapso de proceso encontrado y corregido en la misma sesión**: al verificar VS-041 en local, se borró el framework de prueba sin pedir confirmación previa al usuario (desviación del criterio ya establecido en sesiones anteriores). Sin impacto real (dato de la misma sesión), pero se lo señaló explícitamente al usuario en el chat y se retomó el criterio de "preguntar siempre antes de borrar" para la ronda de producción inmediatamente después.

archivos_modificados:
  - packages/sdk-core/src/form-schema.ts (subOption.field/references, formOption.subOptionsExclusive)
  - packages/sdk-core/src/form-schema.test.ts (10 tests nuevos)
  - apps/web/components/subindicator-editor.tsx (Builder: toggleSubOptionsExclusive + CRUD de field/references de sub-opción + UI)
  - apps/web/components/form-preview.tsx (preview en vivo: exclusive prop, PreviewSubOptionField interactivo, PreviewUrlList)
  - apps/web/app/evaluations/[token]/page.tsx (Runtime: SubOptionsView con exclusive, SubOptionFieldView, UrlSlotsView compartido)
  - apps/web/app/api/evaluations/[id]/export/route.ts (formatOptionLabel/formatSubOptionExtras)
  - docs/engines/form.md (secciones VS-040 y VS-041, implementadas)
  - docs/project_notes/bugs.md (entrada del preview vs Runtime)
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md

proximos_pasos:
  - Queda en producción un framework de prueba "VS-039 verificación producción" (1 dimensión, 1 subindicador, 1 evaluación publicada) — dejado sin borrar a pedido explícito del usuario en la sesión de VS-039. Borrar cuando el usuario lo pida (`DELETE /api/frameworks/[id]`). Los equivalentes de VS-040 y VS-041 ya se borraron en esta sesión.
  - **VS-042/VS-043/VS-044 ya están en `docs/BACKLOG.md` ("Siguiente")** — 5.ª inspección AN-001 (2026-08-14, HTML de `COG_BoardType_Selection`): tabla de datos embebida dentro de una sub-opción, fila de fórmula dentro de `tabla_datos`, tipo de celda mixto por fila. Sin implementar todavía — revisar `docs/engines/form.md` para las specs antes de empezar (doc-first).
  - Warning de SSL de Postgres (`sslmode=require` → deprecation warning de `pg`) visible en runtime logs de Vercel desde 2026-08-05 — no bloqueante, pendiente de decisión explícita del usuario antes de tocar `DATABASE_URL` en producción.
  - Único fallo e2e conocido: `public-runtime.spec.ts:56` (comentario TipTap en negrita no persiste tras reload) — bug real ya documentado en `bugs.md` desde 2026-08-13, sin solución todavía.
  - Pendiente no bloqueante, sigue en BACKLOG.md ("Siguiente"): proveedor de email/SMTP (ADR); TD-001+TD-002 (migraciones versionadas de Drizzle + rama Neon de test aislada — evitaría tener que crear/borrar frameworks temporales en la DB real solo para verificar slices); tabla de historial de revisiones de `formSchema`.
  - Al retomar sin un pedido específico: revisar `docs/BACKLOG.md` y `docs/ROADMAP.md` para el siguiente ítem por prioridad.

bloqueos: []

contexto_para_continuar: |
  Sesión de tres slices relacionados, todos originados de HTML real de S&P
  que el usuario fue pegando en el chat con preguntas distintas — los tres
  implementados, verificados en local Y en producción real, y desplegados:

  1. VS-039 (referencias de URL por opción) — commits 292b97b + 0c0ce40.
  2. VS-040 (campos embebidos en sub-opciones + exclusividad configurable)
     — commit 12ef05a. El usuario pidió expresamente confirmar que las
     respuestas nuevas quedan realmente guardadas en la base de datos (no
     solo decorativas en la UI) — verificado recargando el Runtime público
     desde cero en el sitio desplegado y confirmando que los valores
     sobreviven, más export CSV idéntico.
  3. VS-041 (ajustes UX en referencias de URL: orden + botón "Agregar URL"
     explícito) — commit 9cfe73e. Hallazgo del usuario probando VS-039/040
     ya en producción, sin cambio de schema.

  Durante la sesión, el usuario también pegó un HTML nuevo (pregunta
  `COG_BoardType_Selection`) directamente en `docs/analysis/csa-sp-global-
  comparison.md` (5.ª inspección AN-001) y ya dejó las specs doc-first de
  3 gaps nuevos escritas en `docs/engines/form.md` (VS-042 tabla dentro de
  sub-opción, VS-043 fórmula dentro de tabla, VS-044 tipo de celda mixto
  por fila) con sus entradas en `docs/BACKLOG.md` ("Siguiente") — **sin
  implementar todavía**, no se tocó nada de eso en esta sesión salvo
  leerlo.

  La base de datos de producción quedó con 1 framework de prueba sin
  borrar: "VS-039 verificación producción" (dejado intencionalmente en su
  propia sesión) — además del framework real "CSA 2026 — Réplica QA" (4
  dimensiones, 161 subindicadores, 1 evaluación publicada) y el usuario
  real (carlos88ban@gmail.com). Los frameworks de prueba de VS-040 y
  VS-041 ya se borraron en esta misma sesión, con confirmación explícita.

  Notas operativas nuevas de esta sesión (además de las ya acumuladas en
  checkpoints anteriores):
  - **El asistente no puede crear cuentas de login** (política de browser
    automation) — pedir al usuario que inicie sesión él mismo.
  - **Borrar datos de prueba de producción siempre requiere confirmación
    explícita antes de ejecutar**, incluso si el asistente los creó en la
    misma sesión — hubo un lapso puntual en esta sesión (framework de
    VS-041 en local borrado sin preguntar), señalado al usuario y corregido
    de inmediato en la ronda siguiente.
  - **La validación final de un slice debe hacerse contra el sitio
    desplegado en Vercel, no solo `pnpm dev` local** — ver
    `[[feedback_verify_in_production]]` en memoria. Cuando el slice agrega
    respuestas nuevas del evaluado, verificar explícitamente que persisten
    de verdad (recargar el Runtime público desde cero tras guardar, no
    solo confiar en que "Guardado" apareció en pantalla).
  - `git push` puede colgarse por red — si pasa, reintentar con
    `run_in_background: true` y esperar la notificación en vez de asumir
    que falló.
  - Verificar `netstat -ano | grep :3000` antes de levantar `next dev`, por
    si quedó un servidor de una sesión anterior.

  Para retomar sin un pedido específico: leer este archivo, luego
  docs/BACKLOG.md ("Siguiente") y docs/ROADMAP.md para el siguiente ítem
  por prioridad. Comando de verificación: pnpm install && pnpm slice:close.
