# Sistema de diseño (UI)

Adelantado a pedido explícito del usuario — `docs/slices/VS-006.md` había marcado "diseño visual pulido" como fuera de alcance hasta M12, y `key_facts.md`/`stack.md` dejaban la librería de estilos como decisión abierta ("Tailwind no está decidido"). Este documento cierra esa decisión y especifica el sistema antes de tocar las pantallas (doc-first).

## Decisión de tooling: sin librería de estilos nueva

Se usa **CSS nativo de Next.js** (hoja de estilos global + `next/font`) en vez de Tailwind u otra librería. Next.js ya soporta ambos sin instalar nada — es la opción de menor superficie de dependencias (NFR-3: bajo costo de migración, sin dependencias nuevas que justificar). Con ~10 pantallas y un puñado de componentes reutilizables, una librería de utilidades no aporta sobre unos tokens CSS + 4 componentes de UI compartidos. No se necesita una ADR nueva: no hay dependencia nueva, ni costo, ni vendor lock-in — es aplicar una capacidad que Next.js ya trae (ADR-0001). Se actualiza la fila correspondiente en `stack.md`.

## Contexto del producto (por qué esta dirección, no una genérica)

La plataforma es una herramienta de **construcción y auditoría de evaluaciones de cumplimiento** (ESG/CSA/ISO/auditorías) para ~20 usuarios internos — no un producto de consumo. El propio dominio es jerárquico y estructurado (Framework → Dimensión → Indicador → Subindicador → Elementos, ver `../domain/ubiquitous-language.md`) y el registro de versión (`revisionNumber`) y el enlace público (`token`) son datos que se leen como un ledger/auditoría, no como marketing. El sistema de diseño refleja eso: preciso, estructurado, con jerarquía tipográfica clara — no una landing page.

## Paleta

Definida como variables CSS en `:root` (modo claro) y redefinida bajo `@media (prefers-color-scheme: dark)` + `:root[data-theme]` — nunca se estiliza un componente directamente dentro de un media query, siempre a través de los tokens.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--bg` | `#F6F5F1` | `#12161B` | Fondo de página — neutro cálido (no gris puro), no el cliché "crema cálida" de IA |
| `--surface` | `#FFFFFF` | `#191E25` | Tarjetas, formularios |
| `--surface-muted` | `#EFEDE6` | `#1F252D` | Zebra de listas, encabezados de tabla |
| `--ink` | `#1C2530` | `#E7E4DD` | Texto principal — azul-pizarra profundo, no negro puro |
| `--ink-muted` | `#5B6675` | `#98A2AD` | Texto secundario, meta |
| `--border` | `#83817C` | `#757A80` | Líneas finas (hairline), estilo ledger — ajustado en M12/VS-015 (`accessibility.md`) para cumplir 3:1 (WCAG 1.4.11) contra `--bg`/`--surface` en límites de componentes (inputs, tarjetas) |
| `--accent` | `#33507D` | `#82A2D1` | Marca/foco — azul "tinta de sello", deliberadamente distinto del azul índigo genérico de SaaS y sin colisionar con los colores semánticos |
| `--accent-soft` | `#E4EAF2` | `#223349` | Fondo de estado activo/seleccionado |
| `--good` | `#297147` | `#57B37E` | Semántico — verificado/guardado (separado del accent). Claro ajustado en M12/VS-015 para cumplir 4.5:1 como texto de `Pill` sobre `--good-soft` |
| `--warn` | `#8D5A14` | `#D9A24B` | Semántico — advertencia. Claro ajustado en M12/VS-015 para cumplir 4.5:1 como texto de `Pill` sobre `--warn-soft` |
| `--critical` | `#B23B3B` | `#E2827E` | Semántico — error |

## Tipografía

- **Public Sans** (títulos + cuerpo, vía `next/font/google`, variable, pesos 400/600/700): tipografía del sistema de diseño del gobierno de EE.UU. (USWDS) — encaja temáticamente con una herramienta de cumplimiento/auditoría regulatoria, con más carácter que Inter/Space Grotesk sin dejar de ser muy legible en formularios densos.
- **IBM Plex Mono** (datos: `revisionNumber`, tokens, IDs, timestamps): `font-variant-numeric: tabular-nums` donde haya columnas de dígitos.

Escala: `--text-xs` 12px, `--text-sm` 14px (default en formularios), `--text-base` 16px, `--text-lg` 18px, `--text-xl` 24px (h1). Sin tamaños "hero" — este es un producto de trabajo, se escanea y se opera, no se lee de corrido (ver regla del skill de diseño "cuando es una UI, no un documento").

## Layout

Barra superior persistente (marca + organización activa + usuario) + **breadcrumb** que refleja la jerarquía real del dominio (Framework › Dimensión › Indicador › Subindicador) en vez de un solo link "← Volver" — la jerarquía es el modelo mental central del producto, la navegación debe mostrarla completa, no un paso a la vez. Contenido en una columna centrada de ancho máximo ~840px, agrupado en tarjetas (`.card`) con listas de hairlines en vez de viñetas. Estado (guardado/guardando/error, revisión, tipo de elemento) se codifica también en forma — un `Pill`, no solo texto — para que se lea de un vistazo.

## Componentes compartidos

`apps/web/components/ui.tsx`: `Button` (variantes primary/secondary/danger), `Card`, `Pill` (variantes neutral/good/warn/accent), `Breadcrumb`. Sin librería de iconos — texto y símbolos tipográficos simples (`›`, `✓`) donde hacen falta.
