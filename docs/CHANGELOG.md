# Changelog

Formato: por slice, no por commit individual.

## [Unreleased]

### VS-020 — Botones Save/Cancel/Reset explícitos en Runtime (2026-08-06)

- Gap 5 de AN-001. Aditivo sobre el autosave existente (debounce 1500ms) — no lo reemplaza. Decisión confirmada con el usuario: `Cancel` y `Reset` tienen el mismo efecto (volver al último estado guardado en el servidor), se exponen como dos botones igual que S&P pero comparten una sola implementación (`handleCancelOrReset`).
- `lastSavedBySub` (nuevo `useRef`, no `useState`): última foto de `answers` confirmada por el servidor por Subindicador — inicializada en la hidratación (`GET .../responses`), actualizada en cada autosave exitoso (automático o forzado).
- `Guardar`: cancela el debounce pendiente y guarda ya mismo (mismo `PUT`, solo cambia el momento).
- `Cancelar`/`Restablecer`: revierten el Subindicador activo a `lastSavedBySub` y cancelan cualquier autosave pendiente (para que no sobreescriba la reversión 1.5s después).
- Los tres botones se deshabilitan cuando no hay cambios pendientes (comparación superficial de JSON contra `lastSavedBySub`). Sin cambios en sdk-core/`packages/db` — puramente estado de cliente.
- **Incidente de infraestructura durante el despliegue** (no relacionado al código): el push del commit de código nunca generó un deployment en Vercel — ni siquiera como cancelado, confirmado en el dashboard — mientras que el resto de pushes de la sesión sí lo hicieron en segundos. Diagnosticado como una entrega de webhook GitHub→Vercel perdida para ese push puntual (el webhook en general seguía funcionando, confirmado con un commit vacío posterior que sí generó un deployment, aunque cancelado por el heurístico de "sin cambios en `apps/web`"). Resuelto con un "Redeploy" manual desde el dashboard sobre ese deployment cancelado, que sí reconstruyó el código real (mismo árbol de archivos). Documentado en CHECKPOINT por si se repite.
- Verificado end-to-end en producción: framework de prueba con una pregunta `texto_corto` — botones deshabilitados sin cambios pendientes, escribir habilita los tres, `Cancelar` revierte al último valor guardado (probado escribiendo y cancelando antes de que corriera el autosave, confirmado con el valor previo intacto), `Restablecer` con el mismo comportamiento, `Guardar` dispara "Guardando…" de inmediato sin esperar el debounce y persiste tras recargar. Datos de prueba limpiados.

### VS-019 — N/A + comentario confidencial por pregunta (2026-08-06)

- Gap 4 de AN-001. Capacidad universal de todo Elemento tipo pregunta (excepto `calculado`), sin config nueva en el Builder — S&P no lo hace configurable por pregunta. Dos claves sintéticas más (`${elementId}::na`, `${elementId}::comment`), cero cambios de schema — cuarta vez que este patrón extiende `engine/persistence`.
- `isAnswered(value, na)` reemplaza a `hasAnswer` en progreso, "Marcar como completo" (VS-018) y exportación: una pregunta N/A cuenta como resuelta.
- "Confidencial" documentado explícitamente como etiqueta de UI, no control de acceso real (`permission.md` ya excluye *access-control* granular por recurso de v1) — se incluye en el CSV igual que cualquier otra respuesta (alcance confirmado con el usuario).
- Runtime: checkbox "No aplica" + textarea de comentario (`maxLength` 5000) en cada pregunta; marcar N/A deshabilita el control principal (mismo tratamiento que `approved`/`submitted`, motivo independiente). Revisión: `Pill` "N/A" + comentario visible. Export CSV: "N/A" literal en `Respuesta` cuando aplica, columna nueva `Comentario confidencial`.
- **Bug real encontrado y corregido durante la verificación en producción**: la Regla C de `assertPublicResponseUpdateAllowed` (VS-018) seguía usando `hasAnswer` en vez de `isAnswered` — el Runtime dejaba pulsar "Marcar como completo" sobre una pregunta N/A sin respuesta real, pero el servidor la rechazaba con 403 `element_LOCKED` porque no sabía de N/A. Reproducido en producción, corregido, y cubierto con un test nuevo.
- sdk-core (`naKey`, `commentKey`, `isAnswered`) delegado a OpenCode — contrato completo ya escrito en el doc. `apps/web` (Runtime, Revisión, export) hecho directamente.
- Verificado end-to-end en producción: framework de prueba con una pregunta `texto_corto` — N/A marcado bloquea el input (confirmado que no acepta texto), comentario confidencial persiste tras recargar, "Marcar como completo" funciona con N/A tras el fix, CSV confirma `"N/A"` + `"Completado"` + comentario, página de Revisión muestra todo correctamente. Datos de prueba limpiados.

### VS-018 — Estado por pregunta + flujo Approved/Submitted (2026-08-05)

- Gap 3 de AN-001. Alcance completo pedido por el usuario (no la versión mínima descartada en la decisión de diseño): 5 estados por pregunta — `not_started`/`in_progress` derivados (nunca se persisten), `completed`/`approved`/`submitted` explícitos con clave sintética `${elementId}::status` en el mismo mapa `answers` (cero cambios de schema en `packages/db`, mismo patrón que VS-016/VS-017).
- Tensión resuelta explícitamente con la "Decisión central" de `persistence.md` (sin identidad de evaluado): el lado público solo puede marcar `completed`; `Approved`/`Submitted` son una acción nueva, **autenticada y tenant-scoped** (`requireWriteAccess`, owner/editor — reutiliza 100% el RBAC de VS-014 en vez de inventar identidad de evaluado).
- Integridad real, no solo de UI: `assertPublicResponseUpdateAllowed` (`packages/sdk-core/src/response.ts`) rechaza con 403 `element_LOCKED` cualquier intento —incluso vía `fetch`/`curl` directo, verificado en producción bypaseando la UI— de fabricar un `approved`/`submitted` desde el lado público, o de editar la respuesta de un elemento ya aprobado/enviado.
- `packages/db`: `getResponse` (nuevo lookup de una fila) y `setElementStatus` (mergea la clave de estado sin pisar el resto de `answers`). 2 tests de integración nuevos contra Neon real.
- `apps/web`: página nueva de Revisión (`/frameworks/[frameworkId]/evaluations/[evaluationId]/review`, link "Revisar" en la página de Framework) con Aprobar/Enviar/Revertir; Runtime público gana botón "Marcar como completo", `Pill` de estado, y bloqueo real de inputs (texto/número/selección/evidencia/URL pública) cuando `approved`/`submitted` — editar una respuesta `completed` la regresa a `in_progress` en vez de dejar una marca obsoleta. Export CSV gana columna "Estado".
- sdk-core (`response.ts`: `elementStatus`, `deriveStatus`, `statusKey`, `LockedElementError`, `assertPublicResponseUpdateAllowed`) delegado a OpenCode — contrato completo ya escrito en el doc antes de delegar, correcto a la primera. `packages/db`/`apps/web` (rutas, RBAC, UI, integración) implementados directamente.
- Verificado end-to-end en producción: framework de prueba con una pregunta `texto_corto` — Runtime marca "Completado", Revisión aprueba y envía (botones se habilitan/deshabilitan según el estado), lado público queda bloqueado visualmente (`disabled`) y a nivel servidor (dos intentos de bypass vía `fetch` directo devolvieron 403 `element_LOCKED`), "Revertir" baja `submitted→approved` correctamente, CSV exportado confirma columna "Estado" = "Enviado". Datos de prueba limpiados.

### VS-017 — Campo URL pública, máx. N por pregunta (2026-08-05)

- Gap 2 de AN-001. `docs/engines/form.md`, sección "Campo URL pública (VS-017)": nuevo tipo de Elemento `url_publica` (`maxUrls?`, default 3), complementario a `evidencia` (archivos vs. referencias externas). Respuesta reutiliza la variante `string[]` ya existente de `answerValue` — cero cambios en `response.ts`.
- `packages/sdk-core`: `formElement` gana la rama `url_publica`, `component-registry.ts` gana la entrada correspondiente (obligatoria por el chequeo de exhaustividad). Delegado a un subagente de OpenCode (mecánico, doc ya escrito); tests verdes a la primera.
- Builder: config `Máximo de URLs`. Runtime: `UrlPublicaView`, slots `<input type="url">` acotados a `maxUrls` con "Agregar"/"Quitar"; los slots vacíos nunca se persisten (se filtran antes de escribir en `answers`) para que `hasAnswer()` no cuente un slot en blanco como respuesta.
- Export CSV (`docs/engines/export.md`): `url_publica` une las URLs con `"; "`, sin resolver labels.
- Verificado end-to-end en producción: framework de prueba con `maxUrls: 2`, Builder guarda con autosave, Runtime revela un slot extra hasta el tope y deja de ofrecer uno nuevo al llegar a 2, persistencia confirmada tras recargar, CSV exportado vía `fetch` directo confirma el formato `"url1; url2"`. Datos de prueba limpiados.

### VS-016 — Opciones anidadas en selección única/múltiple (2026-08-05)

- Gap 1 de AN-001. `docs/engines/form.md`, sección "Opciones anidadas (VS-016)": `formOption` gana `subOptions?` opcional (un solo nivel, sin recursión — no se observó un tercer nivel en el portal S&P). Respuesta de sub-opciones marcadas usa clave sintética `` `${elementId}::${optionId}` `` en el mismo mapa `answers` — cero cambios en `response.ts`, `rule.ts` ni el schema de `packages/db`.
- `packages/sdk-core/src/form-schema.ts`: `formOption.subOptions` (zod). Implementado por un subagente de OpenCode (contrato mecánico ya especificado en el doc); tests nuevos en `form-schema.test.ts` verdes a la primera.
- Builder (`SubindicatorFormEditorPage`): CRUD de sub-opciones por opción (`addSubOption`/`updateSubOption`/`removeSubOption`), mismo patrón visual que las opciones de primer nivel, sangrado con borde izquierdo.
- Runtime (`ElementView`): `SubOptionsView` revela un sub-checklist (siempre multi-selección) bajo la opción actualmente seleccionada/marcada que tenga `subOptions`, leyendo/escribiendo la clave sintética vía un nuevo prop `onAnswerChange` (generaliza `setAnswer` para escribir claves distintas a la del elemento).
- Verificado end-to-end en producción (`https://csa-v3-web.vercel.app`): framework de prueba con una pregunta `seleccion_unica` cuya opción "Sí" tiene 2 sub-opciones — Builder guarda y autoguarda (rev. incrementa), Runtime revela el sub-checklist solo cuando la opción padre está seleccionada, marcar una sub-opción autoguarda ("Guardado"), recargar la página confirma persistencia real (no solo estado en memoria) de ambas respuestas. Progreso global correcto (la sub-selección no cuenta como pregunta aparte). Datos de prueba limpiados (evaluación revocada, framework borrado).

### AN-001 — Comparación con el portal S&P Global CSA 2026 (2026-08-05)

- `docs/analysis/csa-sp-global-comparison.md`: análisis comparativo (no slice). Inspección en vivo del portal S&P (sesión real del usuario, sección Questionnaires del CSA 2026, sub-cuestionario 1.1.1 documentado a nivel DOM).
- Resultado: la jerarquía S&P (Dimensión → Criterio → Sub-criterio = formulario) es 1:1 con la ya implementada (Dimensión → Indicador → Subindicador); el Runtime ya replica la navegación del portal (árbol, Prev/Next, progreso) desde VS-010.
- Gaps documentados (aditivos sobre `engine/form`, no arquitectónicos): opciones anidadas, campo URL pública, estado por pregunta + flujo Approved/Submitted, opción N/A + comentarios confidenciales, botones Save/Cancel/Reset, numeración automática. Candidatos a BACKLOG.md si el usuario los prioriza.

### TD-003 — Playwright E2E (2026-08-05)

- `apps/web/e2e/`: Playwright nuevo (deuda TD-003 pagada). `playwright.config.ts` corre contra un `next dev` LOCAL (nunca producción, mismo criterio de R-005/TD-002), `workers: 1` (un solo servidor + Neon compartida). `global-setup.ts`/`global-teardown.ts` crean y borran fixtures reales (usuario, organización, Framework→Subindicador, Evaluación publicada) llamando `auth.api.*` y funciones de `packages/db` directo en Node — nunca por HTTP ni formulario del navegador, así ningún spec escribe jamás una contraseña. La sesión se inyecta vía `storageState` (cookies parseadas a mano del `Set-Cookie` de Better Auth).
- Dos specs cubren los dos flujos críticos: `builder-publish.spec.ts` (Framework→Dimensión→Indicador→Subindicador→Elemento→Publicar→link público, autenticado) y `public-runtime.spec.ts` (responder una Evaluación publicada sin sesión, progreso, persistencia tras recargar, token inexistente).
- `packages/db/src/test-utils.ts` (nuevo): `deleteTestFixtures` — mantiene `drizzle-orm` encapsulado dentro de `packages/db` (el teardown de e2e necesita borrar fixtures pero `apps/web` no debe importar operadores de Drizzle directo).
- **Dos bugs reales de producción encontrados y corregidos por este trabajo** (no solo cobertura nueva):
  1. Accesibilidad: el Runtime (`apps/web/app/evaluations/[token]/page.tsx`) envolvía las preguntas en `<div>` con un `<span>` de label sin asociación real al control — contradecía lo ya declarado cerrado en VS-015/`accessibility.md`. Corregido: un solo control (texto_corto/texto_largo/numero/calculado) → `<label>`; grupo de varios controles (selección única/múltiple, evidencia) → `<fieldset>`+`<legend>`.
  2. Pérdida de datos real en el Runtime: el fetch inicial de respuestas ya guardadas (`GET .../responses`) sobreescribía `answersBySub` sin condición al resolver — si el evaluado alcanzaba a responder algo antes de que este fetch (en paralelo con el fetch de la Evaluación) terminara, esa respuesta se perdía. Corregido fusionando lo recién llegado del servidor con cualquier edición local ya en curso (la edición local, más reciente, gana). Encontrado por flakiness real en el spec, no por diseño previo.
  3. Autosave del Runtime reescrito: la primera versión leía el resultado de un updater de `setState` justo después de llamarlo (asumiendo ejecución síncrona) para construir el payload del autosave — no es una garantía real de React, y en la práctica producía `{ answers: undefined }` (autosave vacío, rechazado por el servidor). Reescrito al patrón correcto: la mutación solo marca qué Subindicador cambió (un `ref`), un `useEffect` separado dispara el autosave desde el estado ya comprometido por React.
- Lección de infraestructura de test, documentada en comentarios: en este entorno (`next dev` con Turbopack en Windows + Neon), la latencia por request varía mucho (cientos de ms a varios segundos) y un `.next` cacheado a medias tras varios reinicios puede devolver 404 genuinos en rutas dinámicas anidadas — mitigado con timeouts generosos (`expect: 15s`, test `timeout: 120s`) y recomendando `.next` limpio si aparecen 404 inexplicables.

### VS-015 — Accesibilidad (WCAG 2.2 AA) (2026-08-05)

- `docs/architecture/accessibility.md`: especificación doc-first. Cierra NFR-5. Sin motor de dominio nuevo (M12 es transversal) — vive en `architecture/`, no en `engines/`. Alcance dirigido a hallazgos reales de auditar los tokens/componentes compartidos con la fórmula de contraste WCAG, no un checklist especulativo de los ~50 criterios.
- Contraste (1.4.11 Non-text Contrast): `--border` medía ~1.3:1 contra `--bg`/`--surface` (muy bajo el 3:1 exigido para límites de `input`/`select`/`textarea`/tarjetas) — ajustado a `#83817C`/`#757A80` (claro/oscuro), ≥3.5:1 en ambos modos contra ambos fondos.
- Contraste (1.4.3 Contrast Minimum): texto de `Pill` variantes `good`/`warn` en modo claro medía 4.30:1/3.72:1 sobre su fondo `-soft` (bajo 4.5:1) — `--good`/`--warn` oscurecidos a `#297147`/`#8D5A14` (≥4.84:1). Modo oscuro ya pasaba, sin cambios.
- Tamaño de objetivo (2.5.8 Target Size Minimum, nuevo en WCAG 2.2): `.btn--sm` medía menos de 24×24px — gana `min-width`/`min-height: 24px`.
- Bypass Blocks (2.4.1): link "Saltar al contenido" nuevo en `apps/web/app/layout.tsx`, apuntando a un wrapper `id="main-content"` alrededor de `{children}` — un solo cambio en el layout raíz, sin tocar las ~13 páginas individuales.
- Status Messages (4.1.3): `aria-live="polite"` en los contenedores de estado de autosave del Form Editor y el Runtime (no en el componente `Pill` en sí, que también se usa para insignias estáticas que no deben anunciarse en cada render).
- Ya cumplido sin cambios: labels de formulario (todo `input`/`select`/`textarea` ya vive envuelto en `<label>`, asociación válida por anidamiento — confirmado inspeccionando el HTML real, no solo el árbol de accesibilidad abreviado), foco visible global (`:focus-visible`), `<html lang="es">`.
- i18n/traducciones sigue explícitamente fuera de alcance — NFR-5 lo excluye de M0–M12; no se instala una librería de i18n sin un segundo idioma real que soportar.
- Verificado en navegador real contra producción: contraste recalculado con la fórmula de luminancia relativa de WCAG contra los valores finales de `globals.css`; skip link confirmado como primer elemento enfocable con Tab (`document.activeElement`) y visible al recibir foco; árbol de accesibilidad de `/organizations` inspeccionado sin gaps reales.

### VS-014 — Permisos (RBAC: dueño / editor / evaluador) (2026-08-05)

- `docs/engines/permission.md`: especificación doc-first. Refina el rol binario `owner`/`member` (VS-003) en tres roles. Sin *statements* de access-control nuevos en Better Auth — el permiso real (escritura sobre el dominio) lo decide `requireWriteAccess`, no el plugin de organización; los roles solo se declaran (reutilizando los permisos de `member` por defecto) porque el **cliente tipado** de Better Auth lo exige para que `inviteMember`/`updateMemberRole` compilen con `"editor"`/`"evaluador"` como valores válidos — ajuste real encontrado al implementar, documentado en la spec.
- `packages/db/src/authz.ts`: `requireWriteAccess` (nuevo) — igual que `requireActiveMember` pero exige `role !== "evaluador"`; nuevo código `AuthzError("FORBIDDEN")` (ya mapea a 403 vía `toErrorResponse` existente).
- 10 rutas de escritura del dominio (`POST`/`PATCH`/`DELETE` en frameworks/dimensions/indicators/subindicators/evaluations) migradas de `requireActiveMember` a `requireWriteAccess`; las rutas de lectura (`GET`, incluida la exportación CSV) no cambian — `evaluador` conserva lectura + exportación.
- UI: `apps/web/app/organizations/page.tsx` gana gestión de miembros/invitaciones (lista con rol, invitar por email+rol, cambiar rol, quitar miembro — visible solo para `owner`) **sin ruta API nueva**, usando directamente `authClient.organization.*` (Better Auth ya expone estas acciones desde VS-003, nunca se habían conectado a una UI). Página nueva `apps/web/app/accept-invitation/[invitationId]/page.tsx`. `login`/`signup` ganan soporte de `?next=` para volver a la invitación tras autenticarse.
- 1 test de integración nuevo en `packages/db` contra Neon real: crea miembros `editor`/`evaluador` de verdad vía `auth.api`, confirma que `requireWriteAccess` rechaza a `evaluador` y permite `owner`/`editor`, y que la lectura sigue abierta a los tres.
- Verificado en navegador real contra producción: sección de miembros lista al `owner`, invitar como `evaluador` genera el link de aceptación real, la página de aceptación existe y Better Auth rechaza correctamente a quien no es el destinatario de la invitación ("You are not the recipient of the invitation"). **Límite documentado** (`project_notes/decisions.md`): no se probó el flujo completo con una segunda cuenta real aceptando + intentando escribir, porque crear esa cuenta requeriría escribir una contraseña — prohibido sin excepciones por las reglas de seguridad de la sesión; esa parte de la corrección queda respaldada por el test de integración contra Neon real, no por un click-through de dos usuarios.

### VS-013 — Motores: fórmula + reglas condicionales (2026-08-05)

- `docs/engines/formula.md`/`docs/engines/rule.md`: especificación doc-first. Decisiones centrales: parser/evaluador de expresiones **a mano** (sin librería, mismo principio ya aplicado en todo el proyecto); `visibleIf` como propiedad de **cualquier** Elemento en vez de inventar un Elemento contenedor `condicional` (que hubiera roto el modelo plano `elements: FormElement[]`); el valor de un `calculado` se **autoguarda como una respuesta más** — reutiliza el 100% de progreso/exportación/persistencia ya construidos, en vez de inventar un concepto nuevo de "valor derivado".
- `packages/sdk-core/src/formula.ts` (nuevo): `parseFormula`/`extractExpressionReferences`/`evaluateExpression` — tokenizer + parser recursivo-descendente (suma, resta, multiplicación, división, paréntesis, menos unario, referencias `{id}`), nunca lanza en evaluación (undefined ante referencia faltante o división por cero).
- `packages/sdk-core/src/rule.ts` (nuevo): `condition` (zod) + `isElementVisible` — condición simple (`elementId`+`operator`+`value`, sin árboles AND/OR); se evalúa siempre contra la respuesta guardada del Elemento referenciado (nunca contra si ese Elemento está visible), lo que evita por completo el problema de dependencias cíclicas de visibilidad sin necesitar código para resolverlo.
- `packages/sdk-core/src/response.ts`: `hasAnswer` (nuevo) — criterio compartido de "¿tiene respuesta?", usado ahora por progreso y por `isElementVisible`.
- `packages/sdk-core/src/form-schema.ts`: rama `calculado` (`expression`, `decimals?`), `visibleIf?: Condition` en `formElementBase` (todo Elemento), `.superRefine()` en `formSchema` que detecta ciclos de fórmulas (DFS blanco/gris/negro sobre el subgrafo `calculado`→`calculado`) y autorreferencias en `visibleIf`.
- UI Builder: id del Elemento visible en su tarjeta (necesario para escribir `{id}` en fórmulas), editor genérico de `visibleIf` (aplica a cualquier tipo), config de fórmula con validación inline (`parseFormula`) y decimales.
- UI Runtime: Elementos ocultos por `visibleIf` se filtran del render y del cálculo de progreso; `calculado` se renderiza de solo lectura y se recalcula/autoguarda en cada cambio relevante.
- API export (VS-012): filtra filas por `isElementVisible`, `calculado` se exporta como cualquier pregunta (columna Tipo = "Calculado").
- 48+26+27 tests nuevos/ampliados en `packages/sdk-core` (`formula.test.ts`, `rule.test.ts`, `form-schema.test.ts`) — 144 tests en total en el monorepo.
- Verificado de punta a punta en navegador real contra producción: Subindicador con `seleccion_unica`+`visibleIf`, dos `numero` y un `calculado`; el Elemento condicionado aparece/desaparece en vivo, el progreso excluye correctamente lo oculto (0%→20%→40%→80%→100%), el calculado se autoguarda y persiste tras recargar, el CSV exportado incluye el calculado y excluye lo oculto, y una fórmula con ciclo es rechazada por la API con 400. Datos de prueba limpiados.

### VS-012 — Exportación de resultados (CSV) (2026-08-05)

- `docs/engines/export.md`: especificación doc-first. Decisión central: **CSV plano**, no Excel/PDF — `SCOPE.md` pide explícitamente "exportación básica" (BI/analítica está fuera de alcance), y CSV no requiere una librería nueva (a diferencia de generar `.xlsx`/PDF real).
- `packages/db/src/domain/evaluation-service.ts`: `getEvaluation(organizationId, id)` (nuevo, lookup tenant-scoped por id — faltaba, `evaluation-service.ts` solo tenía `listEvaluations` y `getEvaluationByToken` sin org).
- API: `GET /api/evaluations/[id]/export` (autenticado, tenant-scoped — a diferencia de `persistence.md`/`evidences.md` que son públicas por token, exportar es una acción de revisión del admin). Una fila por Elemento tipo pregunta (Dimensión/Indicador/Subindicador/Elemento/Tipo/Respuesta); `seleccion_unica`/`multiple` resuelven ids a labels; `evidencia` lista nombres de archivo; preguntas sin responder quedan con celda vacía (refleja cobertura completa, no solo lo respondido). CSV en UTF-8 con BOM (compatibilidad Excel/tildes) y escapado RFC 4180 sin librería nueva.
- UI: link "Exportar CSV" junto a "Revocar" en la lista de Evaluaciones publicadas de `apps/web/app/frameworks/[frameworkId]/page.tsx` — descarga nativa vía `<a href>`, sin manejo de blobs en cliente.
- 1 test de integración nuevo en `packages/db` contra Neon real: `getEvaluation` tenant-scoped (null para Evaluación de otra Organización).
- Verificado de punta a punta en navegador real contra producción: Evaluación con respuestas de texto (con coma), selección única/múltiple (con coma en una opción) y una pregunta sin responder; CSV exportado con click real desde la UI y confirmado por `fetch` — labels correctos, escapado RFC 4180 correcto, tildes/ñ legibles, BOM UTF-8 confirmado en los bytes crudos (`EF BB BF`), celda vacía para la pregunta sin responder, `id` inexistente → 404, sin sesión → 401. Datos de prueba limpiados.

### VS-011 — Evidencias: uploads directos a Cloudflare R2 (2026-08-05)

- `docs/engines/evidences.md`: especificación doc-first. Decisión central: **presigned URLs de R2** — el navegador sube el binario con `PUT` directo a R2 (URL firmada por el servidor, validez 5 min) y descarga con `GET` firmado; los binarios nunca pasan por la función serverless de Vercel (límite Hobby ~4.5MB). Claves `evaluations/{evaluationId}/{uuid}` con anti-IDOR por prefijo: toda operación rechaza keys que no pertenezcan a la Evaluación del token.
- `packages/sdk-core`: octavo tipo de elemento `evidencia` (`isQuestion: true`, config `maxFiles` default 5 / `maxSizeMb` default 10 / `acceptedTypes`) + `evidenceRef` (key/name/size/mimeType) y cuarto caso en `answerValue` — las refs persisten en el jsonb de `response` sin tabla nueva.
- `packages/db`: test de integración contra Neon real — Respuesta con refs de evidencia persiste y se recupera intacta (sin cambios de schema).
- `apps/web`: `lib/r2.ts` (cliente S3/R2 server-only, presign PUT/GET, `belongsToEvaluation`), `lib/evidence-validation.ts` (valida contra el snapshot congelado: elemento debe ser `evidencia`, límites de tamaño/tipo), 3 rutas públicas nuevas (`presign` 413/415, `download-url` 404, `DELETE` idempotente). `api-client.ts` gana `del(path, body?)`.
- UI Runtime: componente `EvidenceView` (input file con accept/multiple derivados, upload secuencial por archivo con indicador, lista con nombre/tamaño + Descargar/Quitar, progreso del Subindicador al tener ≥1 ref). UI Builder: elemento `evidencia` en el selector y config propia (maxFiles/maxSizeMb/acceptedTypes).
- Infra: env vars `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET_NAME` en `.env` y Vercel production; dependencias `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (server-only).
- Hallazgo de producción: el bucket no tenía política CORS y el `PUT` del navegador fallaba con "Failed to fetch" (error de red opaco). Configurado CORS en Cloudflare (orígenes vercel+localhost, métodos GET/PUT/DELETE/HEAD) y documentado en la spec como requisito de operación.
- Verificado de punta a punta en navegador real contra producción: Framework con elemento `evidencia` publicado, upload real desde el link público sin sesión (presign 200 → PUT 200), persistencia tras recarga, descarga íntegra, "Quitar" borra ref y objeto de R2; seguridad: key foránea → 404, elemento no-`evidencia` → 400, >5MB → 413, tipo no aceptado → 415, body vacío → 400. Objetos de prueba limpiados de R2.
- ADR 0003 (Cloudflare R2) pasa de Proposed a Accepted.

### VS-010 — Runtime de respuesta + guardar progreso (2026-08-05)

- `docs/engines/persistence.md`: especificación doc-first. Decisión central: la Respuesta se ata a la Evaluación (`evaluationId`, resuelto vía token), no a una identidad de evaluado — no existe concepto de cuenta de evaluado en el dominio; un enlace publicado es una sesión de respuesta compartida, mismo principio que "sin colaboración concurrente" ya aceptado en `form.md`.
- `packages/db/src/schema/response.ts` (nuevo): tabla `response` (evaluationId/subindicatorId/answers jsonb), única por (evaluationId, subindicatorId). `subindicatorId` sin FK hacia `subindicator` a propósito — la Evaluación es un snapshot congelado, el Subindicador original puede borrarse sin afectarla.
- `packages/db/src/domain/response-service.ts` (nuevo): `upsertResponse` (valida que `subindicatorId` exista en el snapshot antes de aceptar el `upsert`, `ON CONFLICT` sobre la unique compuesta), `listResponses`. Sin `organizationId` — mismo criterio que `getEvaluationByToken`.
- API: `GET/PUT /api/public/evaluations/[token]/responses(/[subindicatorId])` (sin autenticación, bajo prefijo `public/`).
- UI: reescritura completa de `apps/web/app/evaluations/[token]/page.tsx` — árbol de navegación persistente (Dimensión→Indicador→Subindicador, colapsable, con punto de color por progreso), Prev/Next, render real de los 7 tipos de elemento (banner con color por `variant`, preguntas con input real), autosave (debounce 1500ms, mismo patrón que el Builder), progreso global y por Subindicador calculado en cliente (sin columna nueva en DB). Referencia visual explícita: portal S&P Global CSA (comparación pedida por el usuario).
- 3 tests de integración nuevos en `packages/db` contra Neon real: upsert crea y actualiza sin duplicar fila; `subindicatorId` ajeno al snapshot lanza `NotFoundError`; borrar la Evaluación borra en cascada sus Respuestas.
- Verificado de punta a punta en navegador real contra producción: Framework con 2 Dimensiones/3 Indicadores/3 Subindicadores (uno con los 7 tipos de elemento, uno con una pregunta, uno vacío) creado vía API autenticada, publicado, respondido en el link público — árbol, Prev/Next, autosave (confirmado recargando la página), progreso global (67% tras 4/6 preguntas) y color de los puntos del árbol funcionando. Confirmado con `curl` sin cookies que `GET .../responses` devuelve exactamente lo respondido, y que tokens/subindicatorIds inválidos devuelven 404. Datos de prueba (Framework, cascada completa incluyendo Evaluación y Respuestas) limpiados desde producción.

### UI — Sistema de diseño (2026-08-05)

Adelantado a pedido del usuario (fuera del roadmap M0–M12, que reservaba "diseño visual pulido" para M12). No es un slice del roadmap — ver `docs/architecture/design-system.md` para el diseño completo y `docs/project_notes/decisions.md` para el registro de la decisión de adelantarlo.

- `docs/architecture/design-system.md` (nuevo): paleta (6 tokens + semánticos, claro/oscuro vía `prefers-color-scheme` + `data-theme`), tipografía (Public Sans + IBM Plex Mono, vía `next/font/google`, sin dependencias nuevas), concepto de layout (breadcrumb jerárquico, tarjetas, listas de hairlines).
- Decisión de tooling: **sin librería de estilos nueva** (ni Tailwind) — CSS nativo de Next.js (`globals.css` + `next/font`), cero dependencias nuevas. `docs/architecture/stack.md` actualizado, sin ADR nueva (no hay costo/vendor lock-in que justifique una).
- `apps/web/components/ui.tsx` (nuevo): primitivas compartidas `Button`, `Card`, `Pill`, `Breadcrumb`.
- Rediseñadas las 9 pantallas existentes (signup, login, organizations, frameworks, framework detail + publicación, dimension, indicator, Form Editor, página pública de Evaluación) y `AppHeader` — sin cambios de comportamiento, solo visual/estructural (breadcrumbs reemplazan los links "← Volver" de un solo paso).
- Verificado de punta a punta en navegador real contra producción: cuenta nueva → organización → Framework → Dimensión → Indicador → Subindicador → agregar elemento (autosave con pill de estado "Guardado — rev. N") → publicar → abrir el enlace público → confirmar que la jerarquía se ve legible con las cards anidadas. Confirmado modo claro y oscuro (`prefers-color-scheme`) con buen contraste en ambos. Datos de prueba limpiados de Neon.

### VS-009 — Publicación + enlaces seguros (2026-08-05)

- `docs/engines/publishing.md`: especificación doc-first. Decisión central: la Evaluación guarda un **snapshot completo e inmutable** del árbol (no un puntero a `revisionNumber`) porque el schema actual no conserva historial de `formSchema` — construir esa tabla de historial no está pedido por ningún milestone y sería sobre-alcance para este slice.
- `packages/db/src/schema/evaluation.ts` (nuevo): tabla `evaluation` (organizationId/frameworkId/token único/title/snapshot jsonb/publishedAt) aplicada a Neon con `db:push`.
- `packages/db/src/domain/evaluation-service.ts` (nuevo): `createEvaluation` (recorre el árbol, genera token de 192 bits con `crypto.randomBytes`), `listEvaluations`, `deleteEvaluation` (revocar = borrar), `getEvaluationByToken` — la única función del dominio sin `organizationId`, a propósito: la seguridad depende del token, no de una sesión.
- API: `POST/GET /api/evaluations`, `DELETE /api/evaluations/[id]` (autenticados) + `GET /api/public/evaluations/[token]` (sin autenticación, bajo prefijo `public/` para que el límite sea visible en la estructura de carpetas).
- UI: botón "Publicar" + lista de enlaces con "Revocar" en la página de Framework; página pública nueva `apps/web/app/evaluations/[token]/page.tsx` (sin sesión, solo lectura — capturar respuestas es M7).
- 4 tests de integración nuevos en `packages/db` contra Neon real: snapshot fiel al árbol, inmutabilidad tras editar el original, `getEvaluationByToken` sin sesión (inexistente/revocado → `null`), tenant-scoping al publicar.
- Bug real encontrado y corregido: `drizzle.config.ts` no incluía la ruta del nuevo archivo de schema (`./src/schema/evaluation.ts`) — `db:push` reportaba "No changes detected" en vez de crear la tabla, silenciosamente. Mismo patrón de bug ya visto con `turbo.json` (variables de entorno) — un archivo de configuración con una lista explícita de rutas que hay que recordar actualizar en el mismo commit que agrega el archivo nuevo.
- Verificado de punta a punta en navegador real contra producción (no local, mismo criterio que VS-008): publicar desde el Builder generó el link; se confirmó con `curl` sin cookies que `/api/public/evaluations/[token]` responde 200 y devuelve el snapshot completo sin sesión; al revocar, el mismo endpoint pasó a devolver 404 de inmediato.

### VS-008 — Registry de componentes pluggable + versionado (2026-08-05)

- `docs/engines/components.md`: especificación doc-first. "Pluggable" en v1 = un solo lugar de verdad en código para metadata de tipo, no un constructor no-code de tipos nuevos para administradores — se documenta explícitamente qué queda fuera (registry persistido en BD, motor de migración, nuevos tipos de elemento).
- `packages/sdk-core/src/component-registry.ts` (nuevo): `componentRegistry` (7 entradas: type/label/isQuestion/version) con chequeo de exhaustividad en compile-time contra `FormElement["type"]`.
- `packages/sdk-core/src/form-schema.ts`: `formElementBase` gana `componentVersion?: number` (versión del registry vigente al crear el elemento, no se reescribe al editar).
- Form Editor (`apps/web/.../subindicators/[subindicatorId]/page.tsx`): el selector "Agregar elemento" y el type-guard `isQuestion()` pasan a leer del registry en vez de estructuras locales duplicadas (`ELEMENT_TYPE_LABELS`, `QUESTION_TYPES` hardcodeados en VS-007); `newElement()` graba `componentVersion`.
- Bug real encontrado y corregido durante la implementación: anotar `componentRegistry` con el tipo explícito `readonly ComponentDefinition[]` ensanchaba los literales de cada entrada, dejando el chequeo de exhaustividad **vacío** (compilaba aunque se borraran entradas del array). Resuelto usando `as const satisfies readonly ComponentDefinition[]` en vez de una anotación de tipo, que verifica la forma sin perder los literales.
- Verificado en navegador real contra producción (`https://csa-v3-web.vercel.app`, no local, a pedido del usuario): selector "Agregar elemento" sigue mostrando los 7 tipos vía registry, elemento nuevo creado con `componentVersion: 1` (confirmado consultando directamente el `formSchema` en Neon), autosave y persistencia tras recargar siguen intactos.

### VS-007 — Form Engine v1 (2026-08-05)

- `docs/engines/form.md`: especificación doc-first del primer motor real (`engine/form`) — 7 tipos de elemento v1, estructura del Form Schema, autosave, fuera de alcance explícito (Runtime, tipos que dependen de M5/M8/M10).
- `packages/sdk-core/src/form-schema.ts` (nuevo): `formElement` (zod discriminated union) y `formSchema`, con `schemaVersion` independiente de `revisionNumber`. `updateSubindicatorInput` gana el campo `formSchema` (antes excluido a propósito).
- `apps/web/app/api/subindicators/[id]/route.ts`: acepta `formSchema` en el `PATCH` (la persistencia y el versionado ya existían desde VS-004, solo faltaba exponerlo).
- Form Editor nuevo (`apps/web/.../subindicators/[subindicatorId]/page.tsx`): agregar/editar/reordenar/borrar Elementos, autosave con debounce de 1500ms. Enlace "Abrir formulario" añadido a la lista de Subindicadores.
- Test de integración en `packages/db` actualizado con contenido `FormSchema` realista (antes usaba un objeto no representativo).
- Verificado de punta a punta en Chrome real: los 7 tipos de elemento, reordenar, borrar, autosave, y persistencia tras recargar la página.
- **Dos bugs reales corregidos durante la verificación manual** (no solo tipeo):
  1. El autosave se disparaba con solo cargar la página (sin edición del usuario) por depender de un `useEffect` reactivo sobre `elements` — rediseñado para que el autosave se dispare únicamente desde los manejadores de mutación explícitos del usuario.
  2. Un elemento recién agregado (con `label` vacío) fallaba la validación zod y mostraba "Error al guardar" antes de que el usuario pudiera escribir — se relajó el esquema para permitir `label` vacío en un borrador (la validación de "listo para publicar" es de `engine/publishing`, M6).
- Intento de delegar el Form Editor a OpenCode falló por un problema de heredoc de bash en este entorno Windows (~35 min, sin producir el archivo) — se implementó directamente.

### VS-006 — Builder jerárquico (UI) (2026-08-04)

- Cliente Better Auth (`better-auth/react` + plugin `organization`) en `apps/web/lib/auth-client.ts`.
- Páginas: `/signup`, `/login`, `/organizations` (crear/seleccionar organización activa), `/frameworks`, `/frameworks/[id]`, `.../dimensions/[id]`, `.../indicators/[id]` (CRUD de Subindicador con edición inline y borrado).
- `components/app-header.tsx`: header mínimo con email de sesión y cerrar sesión (no especificado originalmente, añadido por necesidad real de usabilidad).
- Corregido: `apps/web/tsconfig.json` no incluía la lib `DOM`, causando errores de tipo confusos en manejadores de eventos y `fetch`.
- Flujo completo (registro → organización → Framework → Dimensión → Indicador → Subindicador → editar → borrar → logout → login) verificado manualmente en Chrome real, no solo con tests automatizados.
- Mismo bug de imports `.js` relativos vs alias `@/*` que en VS-004, evitado desde el inicio en este slice.

### VS-004 — Dominio core CRUD + schema (2026-08-04)

- `docs/domain/evaluation-hierarchy.md`: especificación doc-first del modelo core, fusiona el alcance de VS-004+VS-005 del roadmap original en un slice.
- Schema Drizzle nuevo en `packages/db` (`framework`, `dimension`, `indicator`, `subindicator`), todas con `organizationId` denormalizado, aplicado a Neon.
- Contratos compartidos (zod + tipos) en `packages/sdk-core/src/domain.ts` — SDK-first.
- Servicio CRUD tenant-scoped en `packages/db/src/domain/service.ts` con validación de jerarquía entre organizaciones y versionado de `formSchema`/`revisionNumber` en Subindicador (motor de formularios en sí queda para M4).
- 8 rutas API REST en `apps/web` (`/api/frameworks`, `/dimensions`, `/indicators`, `/subindicators`, cada una con `[id]`).
- 6 tests nuevos en `packages/db` (12 en total con VS-003) contra Neon real.
- Corregido: imports relativos con extensión `.js` hacia `apps/web/lib/` fallaban en Turbopack (Next.js 16) — se migró a los alias `@/*`.

### VS-003 — Auth + Organización (2026-08-04)

- `docs/domain/organization-user.md`: especificación doc-first del agregado Organization/User/Member/Invitation.
- `packages/db` (nuevo): cliente Drizzle sobre Neon, schema de Better Auth generado con su CLI oficial (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`), aplicado a Neon con `drizzle-kit push`.
- Configuración de Better Auth con plugin `organization`: email/password, roles `owner`/`member`, envío de email de invitación desactivado (no hay proveedor de email decidido — el link de aceptación se expone en la respuesta de la API).
- `apps/web` (nuevo): primera app Next.js del monorepo, App Router, con la ruta `app/api/auth/[...all]` sirviendo Better Auth.
- 6 tests de Vitest en `packages/db` cubriendo registro, login, creación de organización, invitación sin email, aceptación de invitación, y tenant-scoping — corren contra el proyecto Neon real con limpieza automática de datos.
- `dotenv-cli` añadido para cargar el `.env` de la raíz de forma consistente en `build`/`test`/`dev`/`db:*`, incluso bajo Turborepo.
- `turbo.json`: corregidos los `outputs` de la task `build` para incluir `.next/**` (antes solo cacheaba `dist/**`).

### VS-002 — Gobernanza + Checkpoint Manager (2026-08-04)

- Añadido árbol completo de `docs/` (visión, objetivos, alcance, roadmap, backlog, riesgos, deuda técnica, dominio, arquitectura, ADRs 0001–0005, checkpoints, project_notes).
- Registradas ADR-0001 (hosting), 0002 (BD), 0003 (storage), 0004 (auth) como `Proposed`; ADR-0005 (tooling) como `Accepted` (ya implementada en VS-001).

### VS-001 — Scaffold monorepo (2026-08-04)

- `git init` del repositorio.
- pnpm workspace + Turborepo + TypeScript strict (`tsconfig.base.json`).
- `packages/sdk-core` mínimo con test real (build/test/typecheck verificados en verde localmente).
- CI en GitHub Actions (`.github/workflows/ci.yml`).
