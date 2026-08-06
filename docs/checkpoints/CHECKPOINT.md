checkpoint: c9e1a1b0-0004-4a2b-8c3d-000000000015
fecha: 2026-08-06
estado: completo
slice_actual: ninguno — VS-022+VS-023 cerrados; queda VS-024 (tabla de datos, `form-table`) como último gap de AN-001 2.ª inspección, sin slice abierto aún

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015, TD-003, VS-016, VS-017, VS-018, VS-019, VS-020, VS-021, VS-022, VS-023]

decisiones_del_dia:
  - Usuario dio automode explícito para completar los 3 gaps de AN-001 2.ª inspección usando skills (`feature-planning`) y verificación 100% en producción (sin pruebas locales manuales). Orden de implementación decidido por criterio propio: select dropdown y unidad por campo numérico primero (son prerequisito de la tabla), tabla de datos al final.
  - VS-022 (`seleccion_desplegable`) y VS-023 (`unit`/`availableUnits` en `numero`) implementados juntos en el mismo commit — son pequeños, tocan los mismos archivos, y ambos son prerequisito de VS-024. Ver `docs/CHANGELOG.md` para el detalle técnico completo de ambos.
  - Especificación doc-first de ambos escrita en `docs/engines/form.md` antes de tocar código (regla rectora), siguiendo el mismo patrón que VS-016/VS-017/VS-021 (`url_publica` como referencia principal).
  - **Bug real encontrado y corregido durante la verificación en producción**: input de `availableUnits` en el Builder perdía comas/espacios al escribir (controlado + recorte en cada `onChange`). Corregido a `onBlur` (no controlado). Detalle en CHANGELOG.
  - Implementado directamente (sin delegar a OpenCode) — cambios pequeños y muy acoplados entre `form-schema.ts`/`component-registry.ts`/`response.ts`/Builder/Runtime/export en el mismo pase.
  - Verificado end-to-end en producción: framework de prueba "VS-022-023 verify" con un Subindicador con `seleccion_desplegable` (Moneda, USD/PEN) y `numero` con `availableUnits` (Consumo energético, MWh/GJ/kWh). Builder, Runtime (select nativo + selector de unidad junto al input), persistencia tras recargar, y export CSV (label resuelto, "1234.5 kWh") confirmados. Publicación de prueba revocada al cerrar (el framework de prueba en sí queda, mismo criterio que "VS-011 Evidencias Prod" de una sesión anterior — no hay UI de borrado de Framework).
  - `docs/BACKLOG.md`: el ítem de tabla de datos actualizado para reflejar que sus dos prerequisitos ya están cerrados; queda como único gap pendiente de AN-001 2.ª inspección.

archivos_modificados:
  - docs/engines/form.md (secciones doc-first "Select dropdown (VS-022)" y "Unidad por campo numérico (VS-023)", tabla de tipos v1 actualizada)
  - packages/sdk-core/src/form-schema.ts (rama `seleccion_desplegable`, `unit`/`availableUnits` en `numero`)
  - packages/sdk-core/src/component-registry.ts (entrada `seleccion_desplegable`)
  - packages/sdk-core/src/response.ts (`unitKey`)
  - packages/sdk-core/src/form-schema.test.ts, response.test.ts (tests nuevos)
  - apps/web/app/frameworks/.../subindicators/[subindicatorId]/page.tsx (Builder: newElement, CRUD de opciones extendido, config de unit/availableUnits con fix onBlur)
  - apps/web/app/evaluations/[token]/page.tsx (Runtime: rama `seleccion_desplegable`, selector de unidad junto al input numérico)
  - apps/web/app/api/evaluations/[id]/export/route.ts (formatAnswer: rama seleccion_desplegable, resolución de unidad, firma con `answers`)
  - apps/web/app/globals.css (estilos `.runtime-question__number-with-unit`/`__unit`)
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md

proximos_pasos:
  - VS-024 (tabla de datos, `form-table`) es el último gap de AN-001 2.ª inspección — el más grande y complejo (filas × columnas, tipo de dato por celda incluyendo `seleccion_desplegable`, unidad + unidades alternativas por celda vía `unit`/`availableUnits`, maxlength/hint). Requiere ensanchar `answerValue` en `response.ts` (ninguna variante actual representa una matriz filas×columnas) — especificación doc-first en `docs/engines/form.md` antes de implementar, sin slice abierto todavía.
  - Pendiente no bloqueante, sigue en BACKLOG.md ("Siguiente"): ítem opcional/menor de AN-001 (banner expandible, sub-opciones 2 niveles, rich text, estado por nodo); proveedor de email/SMTP (ADR); TD-001+TD-002 (migraciones versionadas de Drizzle + rama Neon de test aislada); tabla de historial de revisiones de `formSchema`.

bloqueos: []

contexto_para_continuar: |
  AN-001 2.ª inspección (docs/analysis/csa-sp-global-comparison.md, sección
  "Segunda inspección") identificó 3 gaps nuevos el 2026-08-06: tabla de datos
  (form-table), select dropdown (seleccion_desplegable) y unidad por campo
  numérico. Los últimos dos (VS-022, VS-023) están cerrados y verificados en
  producción. Queda VS-024 (tabla de datos) — el más grande, sin slice abierto,
  requiere especificación doc-first en docs/engines/form.md antes de tocar
  código (regla rectora) y ensanchar answerValue en response.ts.

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
    caracteres ambiguos (I/l, 0/O). Mismo truco sirve para leer una
    exportación CSV sin disparar una descarga de archivo: `await
    fetch(href).then(r => r.text())` en vez de navegar/clickear el link.
  - Los `<select>` nativos del Builder no responden a clicks por coordenada
    en las `<option>` (son popups a nivel de SO, no parte del DOM
    screenshoteable) — usar teclado (`Down`/`Up` + `Return`) tras hacer foco
    en el `<select>`, no coordenadas de click.
  - Inputs de "lista separada por coma" controlados (`value` + `onChange` que
    hace `split(",").filter(Boolean)` en cada tecla) pierden el separador que
    el usuario acaba de escribir por el re-render correctivo — usar `onBlur`
    con `defaultValue` (no controlado) para este patrón, no `onChange`.

  Para retomar sin un pedido específico: leer este archivo, luego
  docs/BACKLOG.md ("Siguiente") y docs/ROADMAP.md para el siguiente ítem
  por prioridad.
  Comando de verificación: pnpm install && pnpm slice:close.
