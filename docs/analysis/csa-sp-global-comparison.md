# Análisis — Comparación con el portal S&P Global CSA 2026

Fecha: 2026-08-05. Tipo: análisis comparativo (no especificación de implementación). Resultado: **la estructura de evaluación del portal S&P Global CSA es replicable con el modelo actual; los gaps están en tipos de elemento/features, no en la arquitectura.**

**Actualización 2026-08-06: los 6 gaps identificados fueron priorizados completos por el usuario e implementados como VS-016 a VS-021 — ver tabla de mapeo abajo, todas las filas quedaron en ✅. Detalle de cada slice en `docs/CHANGELOG.md` y `docs/project_notes/issues.md`.**

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

Ninguno pendiente de este análisis — los 6 gaps identificados están cerrados y verificados en producción. Ver `docs/CHANGELOG.md` (entradas VS-016 a VS-021) para el detalle de implementación de cada uno.
