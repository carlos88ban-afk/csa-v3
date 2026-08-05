checkpoint: c9e1a1b0-0004-4a2b-8c3d-00000000000d
fecha: 2026-08-05
estado: en_progreso
slice_actual: ninguno — roadmap original completo, pendiente definir siguiente fase con el usuario

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014, VS-015]

decisiones_del_dia:
  - VS-015 (M12, último milestone del roadmap original) especificado doc-first en `architecture/accessibility.md` — no `engines/`, porque M12 no introduce un motor de dominio nuevo, es transversal sobre lo ya construido.
  - Alcance deliberadamente acotado a hallazgos reales, no un checklist especulativo de los ~50 criterios de WCAG 2.2 AA: se auditaron con la fórmula real de contraste (luminancia relativa) los tokens compartidos de `design-system.md`, que se propagan automáticamente a las ~13 pantallas por ser el único origen de color de toda la app.
  - Hallazgos reales corregidos: `--border` (1.4.11, ~1.3:1 → ≥3.5:1 contra bg/surface en ambos modos), `Pill` good/warn en modo claro (1.4.3, 4.30/3.72 → ≥4.84:1), `.btn--sm` sin tamaño mínimo de objetivo (2.5.8, nuevo en WCAG 2.2), sin forma de saltar el `AppHeader` (2.4.1), autosave sin anunciar a lectores de pantalla (4.1.3).
  - Ya cumplido, verificado sin cambios: labels de formulario (todo input ya envuelto en `<label>`, confirmado inspeccionando el HTML real — el árbol de accesibilidad abreviado de Chrome no mostraba el nombre computado pero la asociación es válida por anidamiento), foco visible global, `<html lang="es">`.
  - i18n/traducciones sigue explícitamente fuera de alcance (NFR-5 lo excluye de M0–M12) — no se instala una librería de i18n sin un segundo idioma real que soportar, sería infraestructura especulativa.
  - **Con este slice se completan los 12 milestones del roadmap original** (`ROADMAP.md`). No hay un M13 definido — el siguiente paso requiere alinear con el usuario qué sigue (¿nuevas features no anticipadas en el roadmap original? ¿pulir deuda técnica pendiente (TD-001/002/003)? ¿el producto ya cubre lo que el usuario necesita?).

archivos_modificados:
  - docs/architecture/accessibility.md (nuevo), docs/slices/VS-015.md (nuevo), docs/architecture/design-system.md (tabla de paleta actualizada), docs/ROADMAP.md (roadmap cerrado)
  - apps/web/app/globals.css (tokens --border/--good/--warn ajustados, .btn--sm target size, .skip-link nuevo)
  - apps/web/app/layout.tsx (skip link + wrapper id="main-content")
  - apps/web/app/frameworks/.../subindicators/[subindicatorId]/page.tsx, apps/web/app/evaluations/[token]/page.tsx (aria-live en estado de autosave)
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md

proximos_pasos:
  - Sin slice definido. Conversar con el usuario: el roadmap de 12 milestones (auth, dominio core, Builder, Form Engine, registry de componentes, publicación, Runtime de respuesta, evidencias, exportación, fórmulas/reglas, RBAC, accesibilidad) está completo y verificado en producción end-to-end. Preguntar qué sigue antes de especificar nada nuevo (regla doc-first no se salta ni para decidir la siguiente fase).
  - Pendiente no bloqueante, sigue en BACKLOG.md: proveedor de email (ADR), migraciones versionadas de Drizzle (TECH_DEBT TD-001), Playwright (TECH_DEBT TD-003), tabla de historial de revisiones de formSchema si se necesita fuera del contexto de publicación.

bloqueos: []

contexto_para_continuar: |
  Roadmap original M0-M12 completado y verde (pnpm slice:close: 5 tasks
  build, 145 tests, 5 tasks typecheck). La plataforma cubre el ciclo
  completo: Builder jerárquico (Framework→Dimensión→Indicador→
  Subindicador→9 tipos de Elemento incluidos calculado/visibleIf) →
  Publicación con enlaces seguros → Runtime de respuesta con progreso,
  evidencias (R2) y campos calculados en vivo → Exportación CSV → RBAC de
  tres roles con gestión de miembros/invitaciones → accesibilidad WCAG 2.2
  AA auditada sobre los tokens compartidos. La app vive en producción
  (https://csa-v3-web.vercel.app); el flujo de trabajo desde VS-008 verifica
  ahí, no en localhost. No quedan datos de prueba de VS-015 en Neon (cambio
  de CSS/markup, sin datos). Quedan en producción los datos de prueba de
  VS-011 dejados intencionalmente por el agente anterior para revisión del
  usuario (org "Org VS-010", framework "VS-011 Evidencias Prod") — no se
  tocaron en ningún slice posterior.
  Para retomar: leer este archivo, luego docs/BACKLOG.md, luego preguntar
  al usuario qué sigue — no hay una siguiente especificación pendiente de
  implementar todavía.
  Comando de verificación: pnpm install && pnpm slice:close.
