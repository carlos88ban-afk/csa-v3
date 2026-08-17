# VS-054 Implementation Notes

## Completed (2026-08-17)

### 1. API Routes (backend)
- `GET/POST /api/evaluations/[id]/assignments` - listar/crear asignaciones
- `DELETE /api/evaluations/[id]/assignments/[assignmentId]` - desasignar unidad
- `GET /api/organizations/children` - listar unidades de negocio hijas
- `GET /api/evaluations/[id]/for-business-unit/responses` - cargar respuestas autenticadas

### 2. Shared Components
- `components/due-date-banner.tsx` - banner de plazo compartido
  - Aviso 2-3 días antes de vencimiento
  - Banner de cierre tras vencimiento con contactEmail

### 3. Tests added for VS-053 verification
- Cross-tenant isolation tests in `business-unit-access.test.ts`
- All 61 tests passing

## Pending (for completion or VS-055)

### Runtime Autenticado
Decisión de diseño: crear `/evaluations/authenticated/[id]/page.tsx` que:
- Consume `GET /api/evaluations/[id]/for-business-unit` (ya existe)
- Guarda con `PUT /api/evaluations/[id]/for-business-unit/responses/[subindicatorId]` (ya existe)
- Reutiliza máximo código de `/evaluations/[token]/page.tsx`
- Integra `<DueDateBanner dueDate={evaluation.dueDate} contactEmail={evaluation.contactEmail} />`

**Evidencias**: Las rutas públicas de evidencias no validan modo corporativo. Para el Runtime autenticado se necesitan rutas espejo bajo `/api/evaluations/[id]/for-business-unit/evidences/*` (presign, presign-ref, download-url, DELETE) que validen la asignación.

### Panel Publicar en Builder
Ubicación decidida: Botón "Publicar" en `apps/web/app/frameworks/[frameworkId]/builder/page.tsx` junto al área donde se renderiza SubindicatorEditor (el botón "Ver como evaluado" vive en `subindicator-editor.tsx` línea ~1234).

Panel (modal/drawer CSS, mismo patrón que `.form-preview-drawer`):
- Generar evaluación / listar existentes con Revocar (migrar de `frameworks/[frameworkId]/page.tsx`)
- Enlace público (solo si `GET /api/evaluations/[id]/assignments` devuelve array vacío)
- Campos `dueDate`/`contactEmail` editables (usan `PATCH /api/evaluations/[id]`)
- Checklist unidades de negocio:
  - `GET /api/organizations/children` para listar hijas
  - `GET /api/evaluations/[id]/assignments` para ver asignadas
  - `POST /DELETE` para asignar/desasignar
- Botón CSV export (migrar de página eliminada)

Eliminar: `apps/web/app/frameworks/[frameworkId]/page.tsx` (reemplazado completamente)

## Decisions for spec

- Runtime autenticado: ruta separada `/evaluations/authenticated/[id]` en vez de detectar sesión en la ruta pública (más claro, evita confusión con token)
- Evidencias autenticadas: requieren rutas nuevas (las públicas no validan modo corporativo)
- Panel Publicar: drawer CSS (mismo patrón que preview), no modal de librería externa
- Editor de exclusiones y dashboard de progreso: explícitamente diferidos a VS-055

## Next Steps

1. Integrar `DueDateBanner` en `/evaluations/[token]/page.tsx`:
   - Importar componente
   - Renderizar antes del `<h1>` del subindicator activo
   - Pasar `evaluation.dueDate` y `evaluation.contactEmail`

2. Crear `/evaluations/authenticated/[id]/page.tsx`:
   - Extraer lógica compartida a componente helper o duplicar código mínimo
   - Usar rutas autenticadas en vez de públicas
   - Integrar mismo `DueDateBanner`

3. Crear rutas de evidencias autenticadas (espejo de públicas con validación de assignment)

4. Implementar panel Publicar en builder

5. Migrar funcionalidad y eliminar `frameworks/[frameworkId]/page.tsx`

6. Tests, typecheck, build, docs
