# Accesibilidad (WCAG 2.2 AA) — M12/VS-015

Cierra NFR-5 (`requirements.md`: "WCAG 2.2 AA, base para i18n futura — accesibilidad no es opcional"). A diferencia de M1–M11 (`architecture/overview.md`), M12 no introduce un motor de dominio nuevo — es transversal sobre lo ya construido, por eso vive en `architecture/`, no en `engines/`.

## Decisión de alcance: auditoría dirigida a los tokens/componentes compartidos, no un checklist de 50 criterios

WCAG 2.2 AA tiene ~50 criterios de éxito. Auditarlos uno por uno sin evidencia de cuáles aplican realmente sería trabajo especulativo (mismo criterio ya aplicado en todo el proyecto: no se construye infraestructura sin una necesidad concreta). En su lugar, se auditaron con una fórmula real de contraste (luminancia relativa WCAG) los tokens de `design-system.md` — que se propagan automáticamente a las ~13 pantallas existentes por ser el único origen de color de toda la app — y se inspeccionó el árbol de accesibilidad de 3 pantallas representativas en producción. Los hallazgos reales (no hipotéticos) son el alcance de v1.

## Hallazgos y corrección

### 1.4.11 Non-text Contrast — `--border` muy bajo contraste

`--border` contra `--surface`/`--bg` medía **1.44:1 / 1.32:1** (claro) y **1.29:1** (oscuro) — muy por debajo del 3:1 exigido para los límites visuales de componentes de interfaz (bordes de `input`/`select`/`textarea`, tarjetas). Corrección: se oscurece/aclara el token hasta pasar 3:1 contra ambos fondos, sin tocar el resto de la paleta.

| Token | Claro (antes → después) | Oscuro (antes → después) |
|---|---|---|
| `--border` | `#DBD7CE` → `#83817C` (3.89:1 / 3.57:1) | `#2B323B` → `#757A80` (3.87:1 / 4.20:1) |

### 1.4.3 Contrast Minimum — `Pill` variantes `good`/`warn` en modo claro

Texto sobre su propio fondo `-soft`: `--good` medía **4.30:1** y `--warn` **3.72:1**, ambos bajo el 4.5:1 exigido para texto normal (`text-xs`, 12px, no califica como "texto grande"). Modo oscuro ya pasaba (5.25:1 / 5.98:1), sin cambios. Corrección: se oscurecen los tokens de texto (no los fondos `-soft`, para no tocar el resto del sistema semántico good/warn/critical):

| Token | Claro (antes → después) |
|---|---|
| `--good` | `#2E7D4F` → `#297147` (5.04:1) |
| `--warn` | `#A66A17` → `#8D5A14` (4.84:1) |

Resto de combinaciones ya en uso (`ink`/`bg`, `ink-muted`/`bg`, `accent`/`bg`, `accent-ink`/`accent`, `critical`/`critical-soft`) ya cumplían 4.5:1+ en ambos modos — sin cambios.

### 2.5.8 Target Size Minimum (AA, nuevo en WCAG 2.2 — no existía en 2.1)

`.btn--sm` (reordenar Elementos ▲/▼, "Revocar", "Quitar", "Exportar CSV", etc.) medía menos de 24×24px. Corrección: `min-width`/`min-height: 24px` en `.btn--sm`.

### 2.4.1 Bypass Blocks — sin forma de saltar la navegación repetida

No existía un link para saltar el `AppHeader` persistente e ir directo al contenido. Corrección: link "Saltar al contenido" al inicio de `RootLayout` (`apps/web/app/layout.tsx`), visualmente oculto hasta recibir foco (patrón estándar `.skip-link`), apuntando a un contenedor `id="main-content"` que envuelve `{children}` — sin tocar las ~13 páginas individuales, el wrapper vive una sola vez en el layout raíz.

### 4.1.3 Status Messages — cambios de estado no anunciados

Los `Pill` de autosave ("Guardando…"/"Guardado"/error) en el Form Editor (`form.md`) y el Runtime (`persistence.md`) cambian sin recargar la página, pero no se anunciaban a lectores de pantalla. Corrección: `aria-live="polite"` en los contenedores específicos que envuelven esos `Pill` (no en el componente `Pill` en sí — se usa también para insignias estáticas como `revisionNumber` u "obligatorio", que no deben anunciarse en cada render).

## Ya cumplido (verificado, sin cambios necesarios)

- **1.3.1 / 4.1.2 (etiquetado de formularios):** todo `<input>`/`<select>`/`<textarea>` del proyecto ya vive envuelto en `<label className="field">` — asociación válida por anidamiento, sin excepciones encontradas.
- **2.4.7 / 2.4.11 (foco visible):** `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }` ya es global; `--accent` tiene contraste ≥6.4:1 contra ambos fondos en ambos modos.
- **3.1.1 (idioma de la página):** `<html lang="es">` ya presente en `RootLayout` desde VS-003.

## Fuera de alcance (explícito)

- **Auditoría formal/certificada de los ~50 criterios AA** — ver "Decisión de alcance".
- **Pruebas con lector de pantalla real** (NVDA/VoiceOver/JAWS) — se verificó vía árbol de accesibilidad de Chrome (`read_page`) y revisión de código, no audio real con un lector instalado.
- **Implementación de i18n/traducciones** — NFR-5 lo excluye explícitamente de M0–M12 ("i18n se diseña pero no se implementa"). La "base" ya existía (`<html lang="es">`); no se instala una librería de i18n (`next-intl`, etc.) sin un segundo idioma real que soportar — sería infraestructura especulativa.
- **`axe-core`/Playwright de accesibilidad** — `TECH_DEBT.md` TD-003 ya marca que Playwright se añade "cuando el Builder tenga más de un flujo crítico"; una dependencia nueva solo para esta verificación puntual no se justifica (NFR-3).
- **"Polish" visual más allá de lo que señaló esta auditoría** — el sistema de diseño (`design-system.md`) ya se completó como slice separado; no se reabre por estética sin una razón concreta de WCAG/NFR.

## Verificación

- Contraste recalculado con la fórmula de luminancia relativa de WCAG (script Node ad-hoc, no una dependencia del proyecto) contra los valores finales de `globals.css`.
- Árbol de accesibilidad (`read_page` de Chrome) sobre producción en 3 pantallas representativas: login, Form Editor de un Subindicador, Runtime de una Evaluación publicada.
- Navegación por teclado en producción: Tab desde el login confirma que "Saltar al contenido" aparece como primer elemento enfocable y que el foco es visible en cada control siguiente.
