checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000011
fecha: 2026-08-05
estado: en_progreso
slice_actual: ninguno — VS-018 cerrado, siguiente es VS-019 (N/A + comentarios confidenciales)

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016, VS-017, VS-018]

decisiones_del_dia:
  - Usuario priorizó los 6 gaps de AN-001 completos, uno por uno como slice independiente doc-first, OpenCode como subagente para partes mecánicas, verificación exclusivamente en producción.
  - VS-016 (opciones anidadas) y VS-017 (campo URL pública) cerrados primero. Bloqueo real de sesión: la extensión Claude in Chrome dejó de conectar (un comando previo de "matar servidores en segundo plano" corrido vía OpenCode mató `claude.exe --chrome-native-host`); se resolvió solo con reiniciar Chrome por completo.
  - VS-018 (estado por pregunta + Approved/Submitted) cerrado tercero — el más grande de los 6 gaps en superficie de diseño. Antes de escribir código se le preguntó explícitamente al usuario cómo resolver la tensión entre el flujo de revisión de S&P (alguien aprueba lo que otro completó) y la "Decisión central" ya documentada en persistence.md (sin identidad de evaluado). Respuesta del usuario: alcance completo, no la versión mínima, todo debe quedar funcional — no solo los 3 primeros estados, sí Approved/Submitted reales.
  - Resolución de diseño: Approved/Submitted NO se exponen en el lado público (que sigue sin identidad, sin cambios) — son una acción NUEVA, autenticada y tenant-scoped, que reutiliza 100% el RBAC de VS-014 (`requireWriteAccess`, owner/editor) en vez de inventar una identidad de evaluado que nadie pidió. Esto cierra el gap real (alguien de la Organización revisa y aprueba) sin contradecir ni reabrir la decisión arquitectónica ya tomada.
  - Integridad reforzada más allá de la UI: `assertPublicResponseUpdateAllowed` (sdk-core) corre en la ruta pública antes de cada `upsertResponse` y rechaza con 403 cualquier intento de fabricar `approved`/`submitted` o de editar la respuesta de un elemento ya aprobado/enviado — verificado en producción con dos intentos reales de bypass vía `fetch` directo (sin pasar por la UI), ambos devolvieron `element_LOCKED` correctamente.
  - Estado persistido con el mismo patrón de clave sintética que VS-016/VS-017 (`${elementId}::status` en el mismo mapa `answers`) — tercera vez que este patrón evita tocar el schema de `packages/db`, ya establecido como el enfoque por defecto para extender `engine/persistence` de forma aditiva.
  - sdk-core (`response.ts`: `elementStatus`, `deriveStatus`, `statusKey`, `LockedElementError`, `assertPublicResponseUpdateAllowed`) delegado a OpenCode con el contrato exacto ya escrito en el doc — correcto a la primera. `packages/db` y `apps/web` (RBAC, rutas nuevas, página de Revisión, integración en Runtime) implementados directamente por ser la parte de mayor juicio/riesgo.
  - Verificado end-to-end en producción con framework de prueba ("VS-018 Test", Org VS-010): Runtime marca "Completado", Revisión (página nueva autenticada) aprueba/envía/revierte con los botones habilitándose/deshabilitándose según el estado, lado público queda bloqueado (input disabled + 403 server-side confirmado con bypass real), CSV exportado confirma columna "Estado". Datos de prueba limpiados.

archivos_modificados:
  - docs/engines/persistence.md (spec doc-first "Estado por pregunta + flujo Approved/Submitted VS-018"), permission.md (matiz de alcance), export.md (columna Estado)
  - packages/sdk-core/src/response.ts (elementStatus, DerivedStatus, statusKey, deriveStatus, setElementStatusInput, LockedElementError, assertPublicResponseUpdateAllowed), response.test.ts (tests nuevos)
  - packages/db/src/domain/response-service.ts (getResponse, setElementStatus), __tests__/response.test.ts (2 tests nuevos contra Neon real)
  - apps/web/lib/api-errors.ts (LockedElementError -> 403)
  - apps/web/app/api/public/evaluations/[token]/responses/[subindicatorId]/route.ts (resguardo antes de upsertResponse)
  - apps/web/app/api/evaluations/[id]/route.ts (GET nuevo), .../responses/route.ts (nuevo), .../responses/[subindicatorId]/status/route.ts (nuevo, autenticado)
  - apps/web/app/api/evaluations/[id]/export/route.ts (columna Estado)
  - apps/web/app/evaluations/[token]/page.tsx (StatusRow, bloqueo de inputs, limpieza de "completed" al editar)
  - apps/web/app/frameworks/[frameworkId]/page.tsx (link "Revisar"), .../evaluations/[evaluationId]/review/page.tsx (página nueva)
  - apps/web/app/globals.css (.runtime-question__status)
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md

proximos_pasos:
  - Siguiente: VS-019 — N/A + comentarios confidenciales por pregunta, gap 4 de AN-001. Más simple que VS-018 (sin tensión arquitectónica) — probablemente 2 claves sintéticas más por elemento (`${elementId}::na` boolean-ish y `${elementId}::comment` string), mismo patrón ya establecido 3 veces. Confirmar con el usuario si "confidencial" implica ocultar el comentario del CSV/exportación (S&P lo trata como campo interno, no de cara al evaluado externo) antes de diseñar el doc.
  - Luego en orden: VS-020 (Save/Cancel/Reset explícitos), VS-021 (numeración automática).
  - Pendiente no bloqueante, sigue en BACKLOG.md: TD-001+TD-002 (migraciones versionadas + rama Neon de test), proveedor de email (ADR), tabla de historial de revisiones de formSchema si se necesita.

bloqueos: []

contexto_para_continuar: |
  AN-001 (análisis S&P) identificó 6 gaps aditivos sobre engine/form; el
  usuario los priorizó completos el 2026-08-05, alcance completo (no
  versiones mínimas) cuando hay tensión de diseño. VS-016, VS-017 y VS-018
  cerrados y verificados en producción (https://csa-v3-web.vercel.app,
  incluyendo verificación real de los resguardos de seguridad server-side
  de VS-018 con bypass directo). Quedan VS-019 a VS-021 (gaps 4-6), mismo
  proceso cada uno: doc-first → sdk-core (OpenCode si es mecánico) →
  Builder/Runtime (directo) → verificar en producción con claude-in-chrome
  → limpiar datos de prueba → cerrar (CHANGELOG/issues/CHECKPOINT/BACKLOG).
  Antes de VS-019: confirmar con el usuario si "comentario confidencial"
  debe excluirse de la exportación CSV (ver proximos_pasos) — es una
  pregunta de alcance genuina, no asumir.
  Nota operativa: si claude-in-chrome no conecta, verificar primero que
  `claude.exe --chrome-native-host` siga vivo antes de escalar.
  Para retomar: leer este archivo, luego docs/BACKLOG.md ("Siguiente"),
  empezar VS-019 con docs/analysis/csa-sp-global-comparison.md como
  referencia del gap.
  Comando de verificación: pnpm install && pnpm slice:close.
