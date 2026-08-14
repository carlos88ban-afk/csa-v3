# Análisis — Comparación con el portal S&P Global CSA 2026

Fecha: 2026-08-05. Tipo: análisis comparativo (no especificación de implementación). Resultado: **la estructura de evaluación del portal S&P Global CSA es replicable con el modelo actual; los gaps están en tipos de elemento/features, no en la arquitectura.**

**Actualización 2026-08-06: los 6 gaps identificados fueron priorizados completos por el usuario e implementados como VS-016 a VS-021 — ver tabla de mapeo abajo, todas las filas quedaron en ✅. Detalle de cada slice en `docs/CHANGELOG.md` y `docs/project_notes/issues.md`.**

**Actualización 2026-08-06 (2.ª inspección en vivo, sesión nueva):** se re-inspeccionó el portal con la cuenta real del usuario, esta vez recorriendo la estructura completa de Questionnaires (árbol completo + sub-cuestionarios 0.1 "Denominator - Revenues", 1.1.1 y 2.6.1 "Direct GHG Emissions Scope 1" a nivel DOM). Confirmó los 6 gaps cerrados y **descubrió 3 tipos de elemento que el análisis del 05-08 no había visto** (solo se había inspeccionado el sub-cuestionario 1.1.1): **tabla de datos numéricos (`form-table`)**, **select dropdown (`sims-select`)** y **unidad configurable por celda numérica**. Ver "Segunda inspección (2026-08-06)" abajo.

**Actualización 2026-08-06 (3.ª inspección en vivo, sesión posterior):** los 3 gaps adicionales y los 5 ítems menores ya están **implementados y verificados en producción** (VS-022 `seleccion_desplegable`, VS-023 `unit`/`availableUnits` en `numero` y tablas, VS-024 `tabla_datos`, VS-025 banner expandible, VS-026 sub-opciones a 2 niveles, VS-027, VS-028 editor markdown-lite, VS-029 subindicadores directos bajo Dimensión). AN-001 quedó cerrado por completo — el apartado "Siguientes pasos" abajo fue corregido para reflejarlo. El árbol de la participación CSA 2026 vuelve a verificarse idéntico: 6 dimensiones / 34 ramas / 161 sub-cuestionarios, y el sub-cuestionario 1.1.1 inspeccionado de nuevo a nivel DOM (radios con sub-opciones, dropdown select, URLs públicas max 3, editores rich text Jodit, banners expandibles, Save/Cancel/Reset).

**Actualización 2026-08-14 (4.ª inspección, hallazgo nuevo):** al validar en producción contra el HTML real de la pregunta 0.1 del portal S&P (cuestionario "Sustainability Reporting Boundaries", enviado por el usuario), se detectó un matiz que el mapeo anterior daba por resuelto: **las referencias de URL pública viven DENTRO de cada opción de un radio, no como elemento independiente de la pregunta**. En el DOM real, cada opción ("Sí, la empresa informa...", "No, la empresa no informa, pero sí ha divulgado...") lleva su propia fila de referencias (`div.sims-input.reference` con `data-ref-type="public"` y `data-maxrefs="3"`) — la misma pregunta tiene 2 bloques de referencias, cada uno adjunto a una opción distinta, además de sub-opciones anidadas con controles propios (un select de porcentaje dentro de una sub-opción). La plataforma actual modela `url_publica` como un elemento separado numerado (`0.x`) y sus sub-opciones son solo checkboxes de texto — no puede replicar "una sola pregunta con referencias por opción". Ver `docs/engines/form.md` (sección "Referencias de URL por opción (VS-039, implementado — 2026-08-14)") para la spec y su implementación — cerrado el mismo día, verificado en navegador real.

**Actualización 2026-08-14 (5.ª inspección, HTML real de la pregunta `COG_BoardType_Selection` enviado por el usuario):** la pregunta "¿La empresa informa sobre el tipo de junta?" confirma los gaps ya cerrados (referencias por opción VS-039, sub-pregunta radio excluyente VS-040, N/A y "no disponible" como opciones del radio) y **destapa 3 gaps nuevos en anidamiento profundo que la plataforma aún no puede construir como una sola pregunta**: (1) **tabla de datos DENTRO de una sub-opción** — cada sub-opción del sub-radio ("SISTEMA DE UN SOLO NIVEL" / "SISTEMA DE DOS NIVELES") contiene su propia `table.form-table` completa, y la plataforma solo permite `subOption.field` (un control simple) o `references`, no una tabla; (2) **fila de fórmula dentro de la tabla** — la última fila de cada tabla ("Tamaño total de la tabla" / "Tamaño total de ambos tableros") es un input `readonly` con `class="formula"` (suma calculada de las celdas numéricas de la misma tabla, `data-dpd-name="COG_BoardType_BoardSize"`), y `tabla_datos` no tiene `cellType: "calculado"` ni el motor de fórmula (VS-013) referencia celdas de tabla; (3) **tipo de celda mixto dentro de una fila** — la tabla de dos niveles tiene por fila `[texto, texto, número]` (columnas "Tipo de tablero"/"Tipo de director" con labels y "Número de miembros" con inputs), y `tabla_datos` define `cellType` por fila uniforme (decisión de VS-024 que previó exactamente este caso: "es un cambio aditivo, mover `cellType` de la fila a la celda"). Ítems menores del mismo HTML: `data-ref-type="flexible"` (admite también referencias internas, no solo URL pública) y el patrón estándar de 4 opciones (Sí / No / N/A / "La información no está disponible"). Ver specs VS-042/VS-043/VS-044 (pendientes) en `docs/engines/form.md` y sus entradas en `docs/BACKLOG.md`.

## Método

Inspección en vivo del portal (`https://portal.s1.spglobal.com/survey/ui`, sesión real del usuario, cuenta `fernando.ruiz@intercorpretail.pe`): login Okta → dashboard → participación CSA 2026 → tab **Questionnaires** → sub-cuestionario 1.1.1 "Sustainability Reporting Boundaries" (DOM inspeccionado: clases `question-entry`, `banner`, `branch`, `status0..4`, inputs reales). Solo se documenta la sección Questionnaires (Confirmation/Documents fuera de alcance, pedido del usuario).

## Estructura observada en S&P Global CSA 2026

```
0  Company Information
1  Governance & Economic Dimension           ← Dimensión (solo agrupa)
   1.1 Transparency & Reporting              ← Indicador/Criterio (expandible, descripción breve)
       1.1.1 Sustainability Reporting Boundaries   ← Sub-criterio = cuestionario independiente
       1.1.2 Sustainability Reporting Assurance
       1.1.3 MSA Transparency & Reporting
   1.2 Corporate Governance … 1.11
2  Environmental Dimension (2.1–2.9)
3  Social Dimension (3.1–3.7)
4  Future Questions (Optional) — 4.1
5  Feedback Survey
```

Jerarquía exacta: **Dimensión → Criterio (indicador) → Sub-criterio (cuestionario)**. Los criterios e indicadores son solo agrupación con descripción; los sub-criterios son los formularios reales.

### Contenido de un sub-cuestionario (1.1.1)

- **Banners expandibles** (`div.banner.banner-expandable`): *"Requirement: This question requires publicly available information"* y *"Additional information and question guidance"*.
- **Preguntas en acordeón** (`li.question-entry` con `data-aspectid`), numeradas globalmente (ej. `0.1 Denominator - Revenues`), cada una con **estado individual**: `status0` Not Started / `status1` In Progress / `status2` Completed / `status3` Approved / `status4` Submitted.
- **Tipos de campo reales**: radio de opción única **con sub-opciones anidadas** (una opción padre despliega su propio sub-checklist), checkboxes, selects, textarea rich-text (Jodit), **campos de URL pública (máx. 3 por pregunta)**, ramas condicionales (`class="branch"`), textarea "Confidential additional comments" (max 5000 chars).
- **Botones** `Save` / `Cancel` / `Reset` (`#saveButton`, `#cancelButton`, `#resetButton`).
- Barra superior con progreso global ("0% Done") y ventana de participación.

## Mapeo con la plataforma actual

| S&P CSA 2026 | Plataforma CSA | Estado |
|---|---|---|
| Dimensión (1, 2, 3...) — solo agrupa | Dimensión (título + descripción, sin preguntas) | ✅ idéntico |
| Criterio/Indicador (1.1, descripción breve) | Indicador (título + descripción breve, sin preguntas) | ✅ idéntico |
| Sub-criterio = cuestionario (1.1.1) | Subindicador con `formSchema` + `revisionNumber` | ✅ idéntico |
| Banner de requisito / guía | Elemento `banner` (`variant: info/warning`) | ✅ (falta expandible/colapsable) |
| Radio / checkbox / texto / textarea / número | `seleccion_unica`, `seleccion_multiple`, `texto_corto`, `texto_largo`, `numero` | ✅ |
| Ramas condicionales (`branch`) | `visibleIf` en cualquier Elemento (VS-013) | ✅ |
| Evidencias: URL públicas (máx. 3) | Elemento `url_publica` (`maxUrls?`, VS-017), complementario a `evidencia` (archivos) | ✅ resuelto (VS-017) |
| Árbol lateral + Prev/Next + % de progreso | Runtime VS-010 (misma referencia visual declarada) | ✅ |
| Autosave | ✅ debounce 1500ms + botones Save/Cancel/Reset explícitos (VS-020) | ✅ resuelto (VS-020) |
| Estado por pregunta (Not Started→Submitted) | 5 estados por pregunta + flujo Approved/Submitted autenticado, RBAC owner/editor (VS-018) | ✅ resuelto (VS-018) |
| Opciones anidadas (padre → sub-checklist) | `formOption.subOptions` (un nivel), clave sintética por sub-opción (VS-016) | ✅ resuelto (VS-016) |
| Opción "Not applicable" por pregunta | Checkbox N/A universal por pregunta, cuenta como resuelta (VS-019) | ✅ resuelto (VS-019) |
| "Confidential additional comments" por pregunta | Textarea de comentario confidencial por pregunta, incluido en export CSV (VS-019) | ✅ resuelto (VS-019) |
| Numeración automática (1.1, 1.1.1, 0.1) | `dimensionNumber`/`indicatorNumber`/`subindicatorNumber`/`questionNumber`, derivada por posición (VS-021) | ✅ resuelto (VS-021) |
| Multi-respondiente por empresa (flujo Approved/Submit) | Una sesión compartida por enlace (VS-010, decisión explícita); Approved/Submitted resuelto vía RBAC autenticado en vez de identidad de evaluado (VS-018) | ✅ resuelto (VS-018, sin romper la decisión de "sin identidad de evaluado") |
| Tabs Confirmation/Questionnaires/Documents | — | N/A: gestión de participación del portal, no estructura de evaluación (fuera de pedido) |

## Segunda inspección (2026-08-06, sesión completa de Questionnaires)

Recorrido completo del tab Questionnaires de la participación CSA 2026 de InRetail Perú Corp. (cuenta real `fernando.ruiz@intercorpretail.pe`, navegador automatizado Chrome/151, DOM inspeccionado directamente).

### Estructura del árbol (números reales)

- **34 ramas** (`li.branch`): 6 dimensiones + 28 indicadores. **161 sub-cuestionarios** (`li.question-entry`).
- Dimensiones: `0 Company Information`, `1 Governance & Economic Dimension` (11 indicadores, 1.1–1.11), `2 Environmental Dimension` (9, 2.1–2.9), `3 Social Dimension` (7, 3.1–3.7), `4 Future Questions (Optional)` (1, 4.1), `5 Feedback Survey`.
- Numeración exacta `N.N.N` en cada nodo; el sub-cuestionario 0.1 y los 5.x cuelgan **directo de la dimensión sin indicador intermedio** — la jerarquía no es rígida (un nivel 2 es opcional).
- Cada nodo (rama o hoja) lleva **estado de completitud** `status0..status4` (Not Started / In Progress / Completed / Approved / Submitted) con indicador visual por puntito.
- Progreso global "% Done" en la barra superior + botón `Start questionnaire` (solo Administrador, ventana de participación seleccionada en Confirmation).

### Sub-cuestionario 1.1.1 (cualitativo) — ya documentado arriba

### Sub-cuestionario 2.6.1 "Direct GHG Emissions (Scope 1)" (cuantitativo)

- Banner expandible `Notice: Full credit is only possible with relevant publicly available evidence` + banner de guía.
- Pregunta de selección (radio) con **sub-opciones anidadas de 2 niveles** (ej. "Yes, the company tracks its Scope 1 emissions" → tabla → checkboxes de declaración).
- **`table.form-table`**: filas = métricas (Total Scope 1, Coverage %), columnas = años (FY 2022–2025 + Target), **cada celda con tipo de dato propio** (`data-dpd-type="Float|Percent|Text"`), **unidad por celda** (`data-dpd-unit="met. ton. CO2e"`), **lista de unidades alternativas** (`data-dpd-available-units="met. ton. CO2e, metric tonnes carbon equivalent"`), `data-maxchars`, hint por celda.
- **Selects dropdown** (`div.sims-select` con `data-dpd-type="List"`) para unidades/porcentajes dentro de la tabla.
- Checkboxes de declaración (publicly available / third-party verified / normalized / differs), con textarea condicional "provide an explanation" (max 2000 chars) si se marca "differs".
- Referencias (URL) por sección con `data-ref-type="private"|"public"` y `data-maxrefs="3"`.
- Opciones finales: N/A, "The information is not available", comentario confidencial (rich text Jodit, max 5000), botones Save/Cancel/Reset (disabled hasta editar).

### Sub-cuestionario 0.1 "Denominator - Revenues"

- Select de **moneda de reporte** (afecta a todo el cuestionario), tabla `form-table` de Revenues por año fiscal, fecha de cierre fiscal (texto con formato), todo con hint `max. N chars`.

### Hallazgos nuevos vs. el análisis del 05-08 (3 gaps adicionales)

1. **Elemento Tabla de datos (`form-table`)** — no existe en la plataforma actual. Filas × columnas (años) con tipo de dato, unidad, unidades alternativas y maxlength por celda. Es el elemento más complejo del CSA y el único sin equivalente ni acercamiento. Un sub-cuestionario como 2.6.1 es *casi enteramente* una tabla.
2. **Select dropdown (`sims-select`)** — no existe tipo `seleccion_desplegable` (solo radio/checkbox). Se usa para moneda, unidades, porcentajes, dentro y fuera de tablas.
3. **Unidad por campo numérico** — `numero` no tiene `unit` ni lista de unidades alternativas; el CSA las usa de forma ubicua (met. ton. CO2e, %, moneda, MWh...).

Ajustes menores observados (no bloqueantes): el banner actual ya es expandible (VS-025, `banner-expandable`); las sub-opciones de la plataforma son 2 niveles (VS-026, el máximo usado por el CSA); el comentario confidencial del CSA es rich text (Jodit) vs editor markdown-lite actual (VS-028) — ver "Siguientes pasos"; en el árbol, la plataforma marca estado/progreso por nodo y por pregunta, cubriendo el patrón del CSA.

## Veredicto

**Sí se puede construir una evaluación igual de estructurada hoy.** La idea del usuario (admin crea Dimensión → Indicadores con descripción → Subindicadores que son formularios independientes con banners, preguntas y guardado) es exactamente el modelo `Framework → Dimensión → Indicador → Subindicador` ya implementado (VS-004/VS-006/VS-007), y el Runtime ya navega como el portal S&P (árbol colapsable, Prev/Next, puntos de progreso) por referencia visual explícita (VS-010).

Los gaps para igualar la experiencia S&P eran **aditivos sobre `engine/form`** (nuevos tipos de Elemento + config), sin requerir rediseño de la jerarquía ni de la persistencia. Los 6 quedaron resueltos el 2026-08-06:

1. **Opciones anidadas** — ✅ VS-016. `seleccion_unica`/`seleccion_multiple` ganan `subOptions?` (un nivel).
2. **Campo URL pública con límite (max N)** — ✅ VS-017. Tipo `url_publica` con lista de referencias; complementa a `evidencia` (archivos).
3. **Estado por pregunta + flujo Approved/Submitted** — ✅ VS-018. 5 estados por pregunta; Approved/Submitted como acción nueva autenticada (RBAC owner/editor), no identidad de evaluado.
4. **Opción "Not applicable" y "Confidential additional comments"** por pregunta — ✅ VS-019.
5. **Botones Save/Cancel/Reset** — ✅ VS-020. Aditivo sobre el autosave existente (no lo reemplaza).
6. **Numeración automática** del árbol y de las preguntas — ✅ VS-021. Derivada por posición de array, no persistida; no incluye las páginas del Builder (fuera de alcance documentado en `docs/domain/evaluation-hierarchy.md`).

## Siguientes pasos

**Corregido el 2026-08-06 (3.ª inspección): el párrafo anterior de esta sección quedó obsoleto.** Los 3 gaps adicionales (tabla de datos, select dropdown, unidad por celda) ya NO están pendientes: se implementaron como **VS-022 (select dropdown), VS-023 (unidad) y VS-024 (tabla de datos)** y los 5 ítems menores como **VS-025 a VS-029**, todos verificados en producción el 2026-08-06. AN-001 (análisis S&P CSA 2026) está cerrado en su totalidad.

Lo que queda por paridad es cosmético o fuera de alcance acordado:

- **Editor rich text (Jodit) en comentario confidencial**: la plataforma usa editor markdown-lite con toolbar B/I/listas (VS-028), no un editor WYSIWYG completo. Funcionalmente equivalente para el caso de uso; si se quiere paridad visual exacta, es un ítem menor aditivo (reemplazo del textarea rich por Jodit o similar).
- **Granularidad de tipo por celda**: S&P marca `data-dpd-type` por celda; la plataforma define `cellType` por fila (que es el caso real del CSA: columnas = años, tipo definido por la métrica). Mapeado 1:1 para el patrón observado, sin ítem pendiente.
- **Gestión de participación (tabs Confirmation/Documents, ventanas de participación, flujo multi-respondiente)**: fuera de alcance por decisión del usuario (solo sección Questionnaires; multi-respondiente se resuelve con una sesión compartida por enlace + RBAC autenticado).

Para futuras inspecciones del portal, el flujo de login documentado: `portal.s1.spglobal.com/survey/ui` → "Proceed to log in" → Okta (identifier + Password factor) → dashboard → participación CSA 2026 → tab Questionnaires → sub-cuestionario (enlace `a[data-aspectid]`, SPA sin cambio de URL). El árbol de la participación tiene 34 ramas y 161 sub-cuestionarios con estados status0..status4 por nodo.
