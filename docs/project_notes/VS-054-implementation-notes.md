# VS-054 Implementation Notes

## Completed (2026-08-17) — INFRAESTRUCTURA + UI

### 1. API Routes (backend)
- `GET/POST /api/evaluations/[id]/assignments` - listar/crear asignaciones
- `DELETE /api/evaluations/[id]/assignments/[assignmentId]` - desasignar unidad
- `GET /api/organizations/children` - listar unidades de negocio hijas
- `GET /api/evaluations/[id]/for-business-unit/responses` - cargar respuestas autenticadas

### 2. Shared Components
- `components/due-date-banner.tsx` - banner de plazo compartido
  - Aviso 2-3 días antes de vencimiento
  - Banner de cierre tras vencimiento con contactEmail
  - Refactorizado a clases CSS (`due-date-banner`, `--closed`, `--expiring`) en `globals.css` (sin estilos inline)

### 3. Tests added for VS-053 verification
- Cross-tenant isolation tests in `business-unit-access.test.ts`
- All 61 tests passing

### 4. Runtime compartido (extracción)
- `components/runtime-shell.tsx` — TODO el runtime público extraído de `app/evaluations/[token]/page.tsx` (~1990 líneas) a un componente reutilizable `RuntimeShell`.
- Props: `{ mode: "public" | "authenticated"; token?: string; evaluationId?: string }`.
- Internamente calcula `apiBase`: público → `/api/public/evaluations/{token}`; autenticado → `/api/evaluations/{id}/for-business-unit`.
- Todas las URLs de evidencias (`presign`, `presign-ref`, `download-url`, DELETE) y respuestas usan `apiBase` — los subcomponentes (`EvidenceView`, `OptionReferencesView`, `SubOptionsView`, `ElementView`) pasan de recibir `token` a recibir `base`.
- `pageLocked`: si `evaluation.dueDate` ya venció → todo el formulario de solo lectura (botones Guardar/Cancelar/Restablecer deshabilitados, `setAnswer`/`doSave` cortan, inputs `disabled` vía `locked || pageLocked` en `ElementView`). El backend ya bloquea con 403 `evaluation_DUE_DATE_PASSED`; esto es la réplica UX.
- Error mapping: modo autenticado con `err.message.includes("evaluation_assignment")` → pantalla "No tenés acceso a esta evaluación." (403/404 de asignación); resto → 404 genérico.
- `<DueDateBanner>` renderizado en AMBOS modos (prop `dueDate`/`contactEmail`).
- `RuntimeShell` es named export (no default).

### 5. Páginas wrapper
- `app/evaluations/[token]/page.tsx` — wrapper delgado: `use(params)` + `<RuntimeShell mode="public" token={token} />`.
- `app/evaluations/authenticated/[id]/page.tsx` — NUEVO: `<RuntimeShell mode="authenticated" evaluationId={id} />`.

### 6. Rutas de evidencias autenticadas (espejo)
- Bajo `app/api/evaluations/[id]/for-business-unit/evidences/`: `route.ts` (DELETE), `presign`, `presign-ref`, `download-url`.
- Mismo comportamiento que las públicas pero con `requireActiveMember` + `getEvaluationForBusinessUnit` (que valida asignación y devuelve snapshot filtrado por exclusiones VS-053).
- Nota: las rutas públicas de evidencias NO validan modo corporativo (gap preexistente documentado) — en la práctica un token corporativo ya devuelve 404 en el GET público, así que el flujo corporativo siempre pasa por las autenticadas.

### 7. Panel Publicar en Builder
- `components/publish-panel.tsx` — drawer (`form-preview-drawer` CSS) con:
  - Publicar nueva evaluación / listar existentes + Revocar
  - Enlace público `/evaluations/{token}` si NO hay asignaciones; `/evaluations/authenticated/{id}` si corporativo
  - Edición de `dueDate`/`contactEmail` (PATCH `/api/evaluations/[id]`)
  - Asignar/desasignar unidades (GET children + GET/POST/DELETE assignments)
  - Exportar CSV + Revisar (link a la página de revisión, que se conserva)
- Botón "Publicar" en `builder/page.tsx`: `<div className="builder-panel__head">` (nueva clase CSS) con el toggle "🌳 Estructura" + el botón.
- Breadcrumb del Builder: el crumb "Framework" deja de enlazar (la página se elimina).

### 8. Página eliminada
- `app/frameworks/[frameworkId]/page.tsx` — eliminada (su contenido: dimensiones + editor + publicación → migrado al Builder + PublishPanel).
- Breadcrumb de la página de Revisión: enlaza al Editor en vez de la página eliminada.

## Decisions for spec

- Runtime autenticado: ruta separada `/evaluations/authenticated/[id]` en vez de detectar sesión en la ruta pública (más claro, evita confusión con token)
- Evidencias autenticadas: requieren rutas nuevas (las públicas no validan modo corporativo)
- Panel Publicar: drawer CSS (mismo patrón que preview), no modal de librería externa
- Botón "Publicar" vive en la cabecera del builder-panel (nivel framework), NO junto a "Ver como evaluado" (que es per-subindicador)
- Editor de exclusiones y dashboard de progreso: explícitamente diferidos a VS-055
- `pageLocked` (bloqueo por dueDate) aplica al formulario entero en ambos modos

## Next Steps (VS-055 — diferido)

1. Editor de exclusiones por Subindicador/elemento (UI) — backend ya existe (VS-050)
2. Dashboard de progreso por unidad (consolidado para la matriz)
3. Export XLSX multi-pestaña (consolidado + una por unidad)
4. Verificación en producción del Runtime autenticado + panel Publicar