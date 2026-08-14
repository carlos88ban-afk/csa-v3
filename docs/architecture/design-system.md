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

**Actualizado (VS-033) — pivote a dashboard empresarial ancho.** La versión anterior de esta
sección documentaba una columna centrada de ancho máximo ~840px ("estilo ledger", razonada como
"se escanea y se opera, no se lee de corrido, no es un dashboard"). Esa decisión queda superada
por pedido explícito del usuario: con más pantallas de tipo lista (organizaciones, frameworks,
dimensiones, evaluaciones) la columna angosta desaprovechaba una porción grande de cualquier
monitor real (~38% del ancho vacío medido en un viewport de 1366px). El principio de fondo
("se escanea, no se lee de corrido") se mantiene, pero ahora se aplica al nivel de la fila de
tabla, no al ancho total de la página — el mismo espíritu "ledger" en un lienzo más ancho, como
Salesforce/Workday.

**Shell**: sidebar izquierdo persistente (`.app-shell__sidebar`, `--sidebar-width: 260px`) con
marca, navegación principal (Frameworks, Organizaciones) y, al fondo, la organización activa +
sesión + botón de salir — reemplaza la barra superior (`AppHeader`) que antes concentraba lo
mismo en una fila horizontal. El sidebar se oculta automáticamente sin sesión (login/signup/
runtime público de evaluado), igual que antes hacía `AppHeader`. Se colapsa a barra horizontal
no fija en `@media (max-width: 860px)`, el único breakpoint del sistema.

**Ancho de contenido**: `--content-width` sube de `840px` a **`1180px`** — con el sidebar de
260px más el padding del shell, llena un laptop de 1366px (el caso más común de los ~20 usuarios
internos) sin llegar a ancho completo de pantalla, evitando tablas imposibles de escanear en
monitores ultra anchos. `.page--wide` sube de `960px` a `1280px`, para finalmente igualar el
ancho que ya asumía internamente `.builder-layout` (antes recortado en silencio por el padre más
angosto). `.page--narrow` (420px, formularios de auth) **no cambia** — angosto sigue siendo
correcto ahí incluso en un dashboard empresarial.

**Tablas de datos**: las listas administrativas (organizaciones, frameworks, dimensiones) pasan
de listas de viñetas con hairlines (`.entry-list`) a tablas densas (`.data-table`): encabezados
en mayúscula pequeña gris, cebra sutil (`--surface-muted`), hover, columnas numéricas en
`--font-mono` alineadas a la derecha (mismo criterio que ya usaban `revisionNumber`/tokens/IDs).
`.entry-list` no se elimina — sigue siendo el patrón correcto para listas de acciones por fila
que no son tabulares (gestión de roles de miembros, lista de evaluaciones publicadas con Pill +
botones mixtos).

**Excepción deliberada**: `/evaluations/[token]` (runtime público, de cara al evaluado externo,
no personal interno) mantiene su `.runtime-layout` bespoke sin sidebar ni chrome de dashboard
administrativo — es una superficie distinta, no una pantalla de trabajo interno.

Se conserva el **breadcrumb** que refleja la jerarquía real del dominio (Framework › Dimensión ›
Indicador › Subindicador) en vez de un solo link "← Volver" — la jerarquía sigue siendo el
modelo mental central del producto. Estado (guardado/guardando/error, revisión, tipo de
elemento) se sigue codificando en forma — un `Pill`, no solo texto.

## Componentes compartidos

`apps/web/components/ui.tsx`: `Button` (variantes primary/secondary/danger), `Card`, `Pill` (variantes neutral/good/warn/accent), `Breadcrumb`. Sin librería de iconos — texto y símbolos tipográficos simples (`›`, `✓`) donde hacen falta.

`apps/web/components/app-shell.tsx` + `app-sidebar.tsx` (VS-033, reemplazan `app-header.tsx`): shell de dos columnas (sidebar + `<main id="main-content">`), auto-oculta el sidebar sin sesión.

`apps/web/components/data-table.tsx` (VS-034): tabla genérica `DataTable<T>({columns, rows, rowKey, emptyLabel})` para las listas administrativas densas.
