# Motor: `engine/permission` (v1 — M11/VS-014)

RBAC básico (`../architecture/overview.md`; `../SCOPE.md`: "RBAC básico (dueño / editor / evaluador)"). Responsabilidad de este motor: refinar el rol binario `owner`/`member` de `organization-user.md` (M1/VS-003) en tres roles con permisos distintos, y exponer por primera vez en la app la gestión de miembros/invitaciones que VS-003 dejó solo como capacidad de backend probada en tests.

## Roles

| Rol almacenado (`member.role`) | Label en UI | Puede |
|---|---|---|
| `owner` | Dueño | Todo: CRUD completo del dominio, publicar/revocar Evaluaciones, exportar, **y** gestionar miembros/invitaciones/roles de la Organización |
| `editor` | Editor | CRUD completo del dominio (Framework→Dimensión→Indicador→Subindicador→Elementos), publicar/revocar Evaluaciones, exportar. **No** puede gestionar miembros |
| `evaluador` | Evaluador | Solo lectura del dominio (ver el árbol completo, ver Evaluaciones publicadas) + exportar CSV. No puede crear/editar/borrar nada, no puede publicar/revocar |

`owner` es el rol que ya asigna Better Auth automáticamente al crear una Organización (`organization-user.md`) — no se renombra el string almacenado (evitaría chocar con los permisos internos del plugin, ver "Decisión: sin `access-control` custom"), solo se relabela como "Dueño" en la UI. `editor`/`evaluador` son roles nuevos que reemplazan al genérico `member` de VS-003 (rol de transición, documentado ahí mismo como "que M11 refinará").

## Decisión: sin *statements* de `access-control` nuevos (pero sí se declaran los roles)

El plugin `organization` de Better Auth soporta permisos completamente personalizables vía su sub-plugin de access-control (`createAccessControl`, `roles`/`ac` en las opciones del plugin). **No se define ningún statement nuevo**: las acciones que de verdad nos interesa restringir (crear/editar/borrar Framework, publicar Evaluación, etc.) son rutas **propias** del dominio (`apps/web/app/api/**`), decididas enteramente por `requireWriteAccess` (`packages/db/src/authz.ts`), no por el access-control de Better Auth — ese solo gobierna acciones de gestión de la organización en sí (invitar, remover, cambiar rol, actualizar/borrar la organización).

Ajuste real encontrado al implementar (no anticipado en el diseño inicial): aunque a nivel de runtime `member.role` es un `string` libre (`parseRoles(roles: string | string[]): string` en `organization.d.mts`, sin unión de literales), el **cliente tipado** de Better Auth (`authClient.organization.inviteMember`/`updateMemberRole`) infiere el tipo del parámetro `role` a partir de las claves configuradas en `roles` de las opciones del plugin — con la config por defecto (`owner`/`admin`/`member`), pasarle `"editor"`/`"evaluador"` no compila. La solución no fue añadir permisos nuevos, sino **declarar los roles reutilizando los permisos de organización de `member` por defecto**:

```ts
// packages/db/src/auth.ts
import { defaultRoles } from "better-auth/plugins/organization/access";

organization({
  roles: { owner: defaultRoles.owner, editor: defaultRoles.member, evaluador: defaultRoles.member },
})
```

`editor` y `evaluador` quedan con exactamente los mismos permisos de gestión de organización que el `member` por defecto (ninguno — no pueden invitar/remover/actualizar la organización), solo con nombres nuevos que el cliente tipado reconoce. Sigue sin haber statements/permisos custom: es un alias de tipos, no un modelo de permisos nuevo.

## Alcance v1

- **Gate de escritura** en `packages/db/src/authz.ts`: `requireWriteAccess(headers)` — igual que `requireActiveMember` pero además exige `role !== "evaluador"`; lanza `AuthzError("FORBIDDEN")` (nuevo código, ya cae en 403 vía `toErrorResponse` existente, que mapea cualquier código que no sea `UNAUTHENTICATED` a 403).
- Rutas de **escritura** del dominio (`POST`/`PATCH`/`DELETE` en frameworks, dimensions, indicators, subindicators, evaluations) cambian `requireActiveMember` → `requireWriteAccess`. Rutas de **lectura** (`GET`, incluida `evaluations/[id]/export`) se quedan en `requireActiveMember` — cualquier rol, incluido `evaluador`, puede leer y exportar.
- **Invitar con rol**: `apps/web/app/organizations/page.tsx` gana una sección (solo visible si el usuario activo es `owner` de la organización activa) para invitar por email eligiendo `editor` o `evaluador` (nunca `owner` — no hay transferencia/co-titularidad de organización en v1). Usa `authClient.organization.inviteMember` (cliente de Better Auth ya configurado desde VS-003, `apps/web/lib/auth-client.ts`) — **sin ruta API nueva**, el plugin ya expone esta acción vía el catch-all `/api/auth/[...all]` existente, y ya rechaza la llamada del lado del servidor si quien la hace no es `owner`/`admin` (ver "Decisión" arriba). Mismo patrón "sin email" que VS-003: se muestra el link de aceptación (`/accept-invitation/{invitationId}`) para copiar y compartir manualmente.
- **Lista de miembros**: misma sección, `authClient.organization.listMembers` — tabla con email/rol; el `owner` puede cambiar el rol de un miembro (`authClient.organization.updateMemberRole`, entre `editor`/`evaluador`, nunca hacia/desde `owner`) o quitarlo (`authClient.organization.removeMember`).
- **Página de aceptación** (nueva, `apps/web/app/accept-invitation/[invitationId]/page.tsx`): sin sesión, redirige a `/login?next=...` si no hay sesión activa; con sesión, botón "Aceptar" que llama `authClient.organization.acceptInvitation`.

## Fuera de alcance (explícito)

- **`access-control` custom / permisos granulares por recurso** (ej. "este editor solo puede tocar el Framework X") — ver "Decisión" arriba, v1 es organización-ancha, tres niveles.
- **Transferencia de titularidad / múltiples `owner`** — el creador de la Organización es su único `owner` en v1.
- **Envío de invitación por email** — mismo motivo que VS-003, sin proveedor decidido.
- **Permisos sobre Evidencias/Respuestas del evaluado** — no aplica, esa ruta pública (`persistence.md`/`evidences.md`) no depende de sesión ni de `member.role` en absoluto, por diseño. Matizado en VS-018 (`persistence.md`, "Estado por pregunta + flujo Approved/Submitted"): sigue siendo cierto para la ruta pública en sí, pero la **revisión** (`Approved`/`Submitted`) es una acción nueva y autenticada que sí exige `requireWriteAccess` — no reabre este alcance, agrega una capa nueva al lado de la Organización.

## Contratos

Ninguno nuevo en `packages/sdk-core` — los roles son valores de `member.role` (gestionado por Better Auth, no por nuestro dominio), y las respuestas de invitación/miembros vienen tipadas por el propio cliente de Better Auth (`authClient.organization.*`), no necesitan un contrato zod propio.

## Testing

- `packages/db`: test de integración contra Neon real — `requireWriteAccess` rechaza (`AuthzError("FORBIDDEN")`) a un miembro con rol `evaluador` y permite a `owner`/`editor`; `requireActiveMember` (lectura) sigue permitiendo los tres roles.
- Verificación manual **contra producción**: `owner` invita a un email nuevo como `evaluador`, ese usuario acepta la invitación, confirma que puede ver el árbol y exportar CSV pero un intento de `POST /api/frameworks` le devuelve 403; invitar a otro como `editor` y confirmar que sí puede crear/editar contenido pero un intento de invitar a un tercer miembro le devuelve 403 (gestión de membresía sigue siendo solo de `owner`).
