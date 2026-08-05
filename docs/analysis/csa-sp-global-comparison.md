# Análisis — Comparación con el portal S&P Global CSA 2026

Fecha: 2026-08-05. Tipo: análisis comparativo (no especificación de implementación). Resultado: **la estructura de evaluación del portal S&P Global CSA es replicable con el modelo actual; los gaps están en tipos de elemento/features, no en la arquitectura.**

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
| Evidencias: URL públicas (máx. 3) | Elemento `evidencia` (archivos → R2, VS-011) | ⚠️ archivos, no URLs |
| Árbol lateral + Prev/Next + % de progreso | Runtime VS-010 (misma referencia visual declarada) | ✅ |
| Autosave | ✅ debounce 1500ms | ✅ (sin botón Save explícito) |
| Estado por pregunta (Not Started→Submitted) | Progreso % por Subindicador (derivado) | ⚠️ granularidad distinta, sin Approved |
| Opciones anidadas (padre → sub-checklist) | Opciones planas `{id, label}[]` | ❌ gap principal |
| Opción "Not applicable" por pregunta | — | ❌ |
| "Confidential additional comments" por pregunta | — | ❌ |
| Numeración automática (1.1, 1.1.1, 0.1) | — | ❌ (solo título libre) |
| Multi-respondiente por empresa (flujo Approved/Submit) | Una sesión compartida por enlace (VS-010, decisión explícita) | ⚠️ no existe identidad/roles de evaluado |
| Tabs Confirmation/Questionnaires/Documents | — | N/A: gestión de participación del portal, no estructura de evaluación (fuera de pedido) |

## Veredicto

**Sí se puede construir una evaluación igual de estructurada hoy.** La idea del usuario (admin crea Dimensión → Indicadores con descripción → Subindicadores que son formularios independientes con banners, preguntas y guardado) es exactamente el modelo `Framework → Dimensión → Indicador → Subindicador` ya implementado (VS-004/VS-006/VS-007), y el Runtime ya navega como el portal S&P (árbol colapsable, Prev/Next, puntos de progreso) por referencia visual explícita (VS-010).

Los gaps para igualar la experiencia S&P son **aditivos sobre `engine/form`** (nuevos tipos de Elemento + config), no requieren rediseño de la jerarquía ni de la persistencia:

1. **Opciones anidadas** — ampliar `seleccion_unica`/`seleccion_multiple` para soportar sub-opciones (gap estructural de mayor impacto visual).
2. **Campo URL pública con límite (max N)** — tipo `url` con lista de referencias; complementa a `evidencia` (archivos).
3. **Estado por pregunta + flujo Approved/Submitted** — hoy el progreso es % por Subindicador derivado en cliente; falta el estado por pregunta y el flujo de revisión/aprobación.
4. **Opción "Not applicable" y "Confidential additional comments"** por pregunta — conceptos nuevos de Elemento/config.
5. **Botones Save/Cancel/Reset** — hoy todo es autosave silencioso; faltan acciones explícitas (Cancel = descartar cambios locales, Reset = restaurar última respuesta guardada).
6. **Numeración automática** del árbol y de las preguntas.

## Siguientes pasos propuestos (candidatos, no comprometidos)

Diseño doc-first (`docs/engines/form.md` + `sdk-core`) de los gaps 1, 2 y 3 por prioridad; registrar en BACKLOG.md si el usuario los prioriza. El orden sugerido: opciones anidadas → campo URL → estado por pregunta.
