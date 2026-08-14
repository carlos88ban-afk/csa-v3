checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000023
fecha: 2026-08-14
estado: completo
slice_actual: ninguno — VS-040 (campos embebidos en sub-opciones + exclusividad configurable) cerrado. Verificado en local; pendiente decisión del usuario sobre deploy a producción (ver "próximos pasos").

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016, VS-017, VS-018, VS-019, VS-020, VS-021, VS-022, VS-023, VS-024, VS-025, VS-026, VS-027, VS-028, VS-029, VS-030, VS-031, VS-032, VS-033, VS-034, VS-035, VS-036, VS-037, VS-038, VS-039, VS-040]

decisiones_del_dia:
  - **VS-040 — Campos embebidos en sub-opciones + exclusividad configurable**: 2.º hallazgo sobre la misma pregunta 0.1 de S&P que originó VS-039, mismo día. El usuario pidió analizar la sub-pregunta anidada "OverallSustainabilityDisclosure" (revelada bajo la opción "Sí, la empresa informa..."). Dos gaps: (A) una sub-opción trae su propio `<select>` embebido (rangos de % de ingresos) — pedido explícito; (B) hallazgo adicional en el mismo HTML: el grupo es `type="radio"` (excluyente), pero el Runtime siempre renderizaba checkbox (decisión de VS-016 documentada como "siempre selección múltiple, mismo patrón que S&P", que este HTML real contradice). Presentado el análisis completo al usuario con `AskUserQuestion` (2 preguntas: corregir Gap B en el mismo slice sí/no, alcance del field select-only vs select+texto/número) antes de escribir la spec — ambas respondidas afirmativamente/ampliado.
  - **Implementación**: spec doc-first en `docs/engines/form.md` primero (regla rectora). `packages/sdk-core`: `subOption` gana `field?: {type: "seleccion_desplegable"|"texto_corto"|"numero", ...}` y `references?` (mismo campo que `formOption`, ahora también a nivel de sub-opción); `formOption` gana `subOptionsExclusive?: boolean` (default `false`, compatible hacia atrás). 10 tests nuevos. Builder (`subindicator-editor.tsx`): checkbox "Sub-opciones excluyentes" + selector "Agregar campo…" por sub-opción con su configuración. Runtime (`evaluations/[token]/page.tsx`): `SubOptionsView` gana prop `exclusive` (radio vs checkbox, solo nivel 1) + `SubOptionFieldView` nuevo. Preview del Builder (`form-preview.tsx`): mismo comportamiento, ahora interactivo (a diferencia de `url_publica`, un campo simple sí se simula funcionalmente). Export CSV: sub-opción marcada con su `field` resuelto se anexa a la celda `Respuesta` tras un `—`.
  - **Bug preexistente corregido de paso**: al implementar la exclusividad explícita, se encontró que el preview del Builder (`PreviewSubOptions`) trataba las sub-opciones de nivel 1 como radio por una heurística fija (`level === 1`) desde VS-016, mientras el Runtime real siempre las trataba como checkbox — inconsistencia sin impacto en datos (el preview nunca persiste), documentada en `docs/project_notes/bugs.md` y corregida: ambos componentes ahora leen el mismo campo explícito `subOptionsExclusive`.
  - **Verificación manual en navegador local**: framework temporal "VS-040 verificación temporal" creado (sin tocar "VS-039 verificación producción", dejado intencionalmente de la sesión anterior). Verificado Builder (checkbox exclusividad + campo select con 2 opciones de rango), preview en vivo, Runtime público (confirmada la exclusividad REAL: seleccionar "Todas las actividades" desmarca "El siguiente % de ingresos cubierto" y oculta su `<select>`; el valor del select persiste al volver a seleccionar), y export CSV (`"Sí, la empresa informa — El siguiente % de ingresos cubierto (0-25%)"`). `pnpm typecheck`/`build`/`test` en verde.
  - **Pendiente al cierre de esta sesión**: a diferencia de VS-039, esta sesión NO llegó a preguntar/ejecutar el commit+push+deploy a producción para la validación final contra `csa-v3-web.vercel.app` (criterio establecido en `[[feedback_verify_in_production]]`) — quedó verificado solo en local (misma DB real de Neon, pero código sin desplegar). Framework temporal "VS-040 verificación temporal" quedó sin borrar en la base de datos (ni se preguntó al usuario todavía) porque la sesión se cerró en el paso de verificación local.

archivos_modificados:
  - packages/sdk-core/src/form-schema.ts (subOption.field/references, formOption.subOptionsExclusive)
  - packages/sdk-core/src/form-schema.test.ts (10 tests nuevos)
  - apps/web/components/subindicator-editor.tsx (Builder: toggleSubOptionsExclusive + CRUD de field/references de sub-opción + UI)
  - apps/web/components/form-preview.tsx (preview en vivo: exclusive prop, PreviewSubOptionField interactivo)
  - apps/web/app/evaluations/[token]/page.tsx (Runtime: SubOptionsView con exclusive, SubOptionFieldView nuevo)
  - apps/web/app/api/evaluations/[id]/export/route.ts (formatOptionLabel/formatSubOptionExtras)
  - docs/engines/form.md (nueva sección VS-040, implementado)
  - docs/project_notes/bugs.md (entrada del preview vs Runtime)
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md

proximos_pasos:
  - **Pendiente inmediato**: preguntar al usuario si procede el commit + push + deploy de VS-040 y repetir la validación final contra `https://csa-v3-web.vercel.app` (mismo criterio que VS-039, ver `[[feedback_verify_in_production]]`) — todavía sin commitear en git al cierre de esta sesión.
  - Queda en la base de datos un framework de prueba local "VS-040 verificación temporal" (1 dimensión, 1 subindicador, 1 evaluación publicada) sin borrar — igual que "VS-039 verificación producción" de la sesión anterior, preguntar al usuario antes de borrar cualquiera de los dos.
  - Warning de SSL de Postgres (`sslmode=require` → deprecation warning de `pg`) visible en runtime logs de Vercel desde 2026-08-05 — no bloqueante, pendiente de decisión explícita del usuario antes de tocar `DATABASE_URL` en producción.
  - Único fallo e2e conocido: `public-runtime.spec.ts:56` (comentario TipTap en negrita no persiste tras reload) — bug real ya documentado en `bugs.md` desde 2026-08-13, sin solución todavía.
  - Pendiente no bloqueante, sigue en BACKLOG.md ("Siguiente"): proveedor de email/SMTP (ADR); TD-001+TD-002 (migraciones versionadas de Drizzle + rama Neon de test aislada — evitaría tener que crear/borrar frameworks temporales en la DB real solo para verificar slices); tabla de historial de revisiones de `formSchema`.
  - Al retomar sin un pedido específico: revisar `docs/BACKLOG.md` y `docs/ROADMAP.md` para el siguiente ítem por prioridad.

bloqueos: []

contexto_para_continuar: |
  Sesión de dos slices relacionados, ambos originados del mismo HTML real
  de S&P (pregunta 0.1 "Sustainability Reporting Boundaries") que el
  usuario pegó dos veces con preguntas distintas:

  1. VS-039 (referencias de URL por opción) — implementado, verificado en
     local Y en producción real (commit 292b97b + 0c0ce40, deployado).
  2. VS-040 (campos embebidos en sub-opciones + exclusividad configurable)
     — implementado y verificado en local; el commit/push/deploy a
     producción para la validación final QUEDÓ PENDIENTE al cierre de esta
     sesión (ver "próximos pasos" — preguntar al usuario primero).

  La base de datos de producción tiene actualmente 2 frameworks de prueba
  sin borrar (dejados intencionalmente o por corte de sesión, no por
  descuido): "VS-039 verificación producción" y "VS-040 verificación
  temporal" — además del framework real "CSA 2026 — Réplica QA" (4
  dimensiones, 161 subindicadores, 1 evaluación publicada) y el usuario
  real (carlos88ban@gmail.com). Ninguno de los dos frameworks de prueba se
  borra sin preguntar antes.

  Notas operativas nuevas de esta sesión (además de las ya acumuladas en
  checkpoints anteriores):
  - **El asistente no puede crear cuentas de login** (política de browser
    automation) — pedir al usuario que inicie sesión él mismo.
  - **Borrar datos de prueba de producción siempre requiere confirmación
    explícita antes de ejecutar**, incluso si el asistente los creó en la
    misma sesión.
  - **La validación final de un slice debe hacerse contra el sitio
    desplegado en Vercel, no solo `pnpm dev` local** — ver
    `[[feedback_verify_in_production]]` en memoria. VS-040 quedó sin este
    paso al cierre de la sesión; retomarlo si el usuario no lo pidió ya.
  - Verificar `netstat -ano | grep :3000` antes de levantar `next dev`, por
    si quedó un servidor de una sesión anterior.

  Para retomar sin un pedido específico: leer este archivo, luego
  docs/BACKLOG.md ("Siguiente") y docs/ROADMAP.md para el siguiente ítem
  por prioridad. Comando de verificación: pnpm install && pnpm slice:close.
