checkpoint: c9e1a1b0-0004-4a2b-8c3d-00000000000c
fecha: 2026-08-05
estado: en_progreso
slice_actual: VS-015

slices_completados: [VS-001, VS-002, VS-003, VS-004, VS-006, VS-007, VS-008, VS-009, VS-010, VS-011, VS-012, VS-013, VS-014]

decisiones_del_dia:
  - VS-014 (engine/permission) especificado doc-first en engines/permission.md — refina el rol binario owner/member (M1/VS-003) en tres roles (owner/editor/evaluador). El permiso real (escritura sobre el dominio) lo decide `requireWriteAccess` (packages/db/src/authz.ts), no el access-control de Better Auth.
  - Hallazgo real durante la implementación (no anticipado en la spec inicial): aunque `member.role` es un string libre en runtime, el CLIENTE TIPADO de Better Auth (`authClient.organization.inviteMember`/`updateMemberRole`) infiere el tipo del parámetro `role` de las claves configuradas en las opciones del plugin — con la config por defecto (owner/admin/member), pasar "editor"/"evaluador" no compilaba. Resuelto declarando los tres roles en `roles` (server `auth.ts` y client `auth-client.ts`), reutilizando los permisos de organización de "member" por defecto para editor/evaluador — sin agregar statements de access-control nuevos, es un alias de tipos, no un modelo de permisos nuevo.
  - Se expuso por primera vez en la app la gestión de miembros/invitaciones que VS-003 dejó solo como capacidad de backend probada en tests — sin ruta API nueva, usa `authClient.organization.*` directo (invite/list/updateRole/remove), mismo patrón "sin email, se comparte el link" que VS-003 estableció.
  - Se delegó a un subagente de OpenCode el barrido mecánico de gatear las 10 rutas de escritura (requireActiveMember → requireWriteAccess en POST/PATCH/DELETE de frameworks/dimensions/indicators/subindicators/evaluations) — correcto a la primera (verificado leyendo el contenido real de los archivos, no solo el diff, porque los headers de contexto de git diff eran engañosos entre métodos con cuerpos casi idénticos).
  - Límite de verificación manual documentado explícitamente en `project_notes/decisions.md`: no se probó el flujo completo de aceptación + intento de escritura con una segunda cuenta real, porque crear esa cuenta requeriría escribir una contraseña — prohibido sin excepciones por las reglas de seguridad de la sesión. Se verificó en producción todo lo que no requiere esa segunda contraseña (crear invitación, link real, página de aceptación, rechazo de Better Auth a quien no es el destinatario); la corrección de `requireWriteAccess` en sí queda respaldada por un test de integración contra Neon real (mismo dato que produce producción).

archivos_modificados:
  - docs/engines/permission.md, docs/slices/VS-014.md, docs/engines/README.md, docs/architecture/overview.md, docs/ROADMAP.md, docs/project_notes/decisions.md (spec + resultado doc-first + límite de verificación)
  - packages/db/src/authz.ts (+requireWriteAccess, +FORBIDDEN), src/index.ts (export), src/auth.ts (+roles owner/editor/evaluador)
  - packages/db/src/__tests__/domain.test.ts (+test requireWriteAccess), __tests__/auth.test.ts (role "member" -> "editor"/"evaluador")
  - apps/web/app/api/{frameworks,dimensions,indicators,subindicators,evaluations}/**/route.ts (10 archivos: requireActiveMember -> requireWriteAccess en escritura)
  - apps/web/lib/auth-client.ts (+roles), apps/web/app/organizations/page.tsx (sección de miembros/invitaciones), apps/web/app/accept-invitation/[invitationId]/page.tsx (nuevo)
  - apps/web/app/login/page.tsx, apps/web/app/signup/page.tsx (+soporte ?next=)
  - docs/CHANGELOG.md, docs/BACKLOG.md, docs/project_notes/issues.md

proximos_pasos:
  - M12/VS-015+: i18n + WCAG 2.2 AA + polish — último milestone del roadmap original (docs/ROADMAP.md). A diferencia de M1-M11, no introduce un motor nuevo (ver architecture/overview.md); es transversal sobre todo lo ya construido. Especificar alcance antes de implementar (doc-first) — NFR-5 ya documenta "i18n se diseña pero no se implementan traducciones en M0-M12", revisar qué significa exactamente "polish" en este punto del proyecto.
  - Pendiente no bloqueante: proveedor de email (BACKLOG), migraciones versionadas de Drizzle (TECH_DEBT TD-001), Playwright (TECH_DEBT TD-003), tabla de historial de revisiones de formSchema si se necesita fuera del contexto de publicación (ver engines/publishing.md).

bloqueos: []

contexto_para_continuar: |
  M0 a M11 completados y verdes (pnpm slice:close: 5 tasks build, 145 tests,
  5 tasks typecheck). El roadmap funcional original (M0-M11) está cerrado:
  Builder completo, Form Engine con los 9 tipos de Elemento (incluidos
  calculado/visibleIf de M10), publicación + Runtime de respuesta +
  evidencias + exportación CSV, y ahora RBAC de tres roles (dueño/editor/
  evaluador) con gestión de miembros/invitaciones expuesta en la app por
  primera vez. Solo queda M12 (i18n + WCAG + polish) del roadmap original de
  12 milestones. La app vive en producción
  (https://csa-v3-web.vercel.app); el flujo de trabajo desde VS-008 verifica
  ahí, no en localhost. No quedan datos de prueba de VS-014 en Neon (la
  invitación de prueba se canceló). Quedan en producción los datos de
  prueba de VS-011 dejados intencionalmente por el agente anterior para
  revisión del usuario (org "Org VS-010", framework "VS-011 Evidencias
  Prod") — no se tocaron.
  Para retomar: leer este archivo, luego docs/BACKLOG.md, luego decidir con
  el usuario si el siguiente paso es M12 (i18n/WCAG/polish) o si el roadmap
  original de 12 milestones ya cubre lo que el usuario necesita y toca
  definir una nueva fase.
  Comando de verificación: pnpm install && pnpm slice:close.
