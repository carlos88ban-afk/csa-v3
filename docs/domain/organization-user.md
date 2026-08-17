# Dominio — Organización y Usuario

Agregados base para multi-tenancy (M1, VS-003). Precede a los agregados del núcleo de evaluación (`ubiquitous-language.md`), que siempre cuelgan de una Organización.

## Agregados

### User (AR)

Identidad de una persona. Gestionado por Better Auth (email/password). Un User puede pertenecer a más de una Organización (relación N:N vía Member).

### Organization (AR)

Tenant dueño de Frameworks y Evaluaciones (ver `ubiquitous-language.md`). Provista por el **plugin `organization` de Better Auth** (no se modela como tabla custom).

**Extendido en VS-050+** con `parentOrganizationId` (nullable, self-reference, vía `additionalFields` del plugin — no se edita `schema/auth.ts` a mano, es generado): modela una jerarquía de un nivel matriz↔unidades de negocio. Ver `business-units.md` para el diseño completo (evaluación compartida entre unidades, filtrado de preguntas por unidad, aislamiento de progreso). Una Organization sin `parentOrganizationId` sigue siendo el caso normal (independiente o matriz); nada cambia para tenants que no usan jerarquía.

### Member

Relación User ↔ Organization con un `role`. Provista por el plugin de Better Auth.

- Roles en VS-003: `owner` | `member` — el mínimo necesario para que exista tenant-scoping funcional.
- **Fuera de alcance en VS-003:** el RBAC completo (dueño/editor/evaluador descrito en `../architecture/overview.md`, motor `engine/permission`) es M11 (VS-014). No se debe implementar lógica de permisos granular ahora — solo la pertenencia a organización y un rol binario `owner`/`member` que el engine de M11 refinará.

### Invitation

Invita a un email a unirse a una Organización con un rol. Provista por el plugin de Better Auth (tabla + hooks `beforeAcceptInvitation`/`afterAcceptInvitation`/etc.).

## Decisión: sin envío de email en VS-003

El plugin de Better Auth soporta enviar la invitación por email, pero **ningún proveedor de email/SMTP está decidido en el stack** (no hay ADR para esto). Introducir uno ahora violaría doc-first (se elegiría una dependencia sin la justificación/alternativas que exige `../architecture/stack.md`).

**Decisión para VS-003:** se desactiva el envío de email del plugin. Al crear una invitación, el sistema expone el link de aceptación (token) para que el `owner` lo copie y comparta manualmente — mismo patrón que se usará para "enlaces seguros" de Evaluaciones en M6 (F3). Se registra en `../BACKLOG.md` como ítem futuro: "decidir proveedor de email (ADR) si se necesita invitación automática por correo".

## Tenant-scoping

- La sesión de Better Auth expone la organización activa (`activeOrganizationId` del plugin).
- **Invariante:** toda tabla de dominio que se cree a partir de M2 en adelante (Framework, Evaluación, etc.) debe tener `organizationId` obligatorio y no nulo. Ninguna query de dominio puede omitir el filtro por `organizationId` de la sesión activa.
- En VS-003 esto solo se establece como regla — no hay todavía tablas de dominio (Framework, etc.) a las que aplicarla; se verifica en la práctica desde VS-004.

## Aceptación funcional

- Registro de usuario (email/password).
- Login.
- Creación de una Organización (el creador queda como `owner`).
- Invitar a un email a la Organización → genera invitación con link (sin envío de correo).
- Aceptar invitación (con sesión ya autenticada, o registrándose primero) → el usuario queda como `member`.
- Un usuario solo puede leer/escribir dentro de organizaciones de las que es miembro (tenant-scoping verificado con test).
