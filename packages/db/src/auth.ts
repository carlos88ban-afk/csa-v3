import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { defaultRoles } from "better-auth/plugins/organization/access";
import { db } from "./client.js";
import * as schema from "./schema/auth.js";

/**
 * No hay proveedor de email/SMTP decidido en el stack (ver docs/adr/).
 * Introducir uno ahora violaría doc-first. El invite queda expuesto vía
 * el valor de retorno de la API de invitación (link/token), no por correo.
 * Ver docs/domain/organization-user.md.
 *
 * `invitationEmailCallCount` existe solo para que los tests puedan verificar
 * que este hook nunca intenta enviar correo de verdad.
 */
export let invitationEmailCallCount = 0;
async function sendInvitationEmail() {
  invitationEmailCallCount += 1;
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    organization({
      sendInvitationEmail,
      // Roles RBAC de M11 (ver docs/engines/permission.md): "editor" y
      // "evaluador" reutilizan los permisos de organización de "member" por
      // defecto (sin acciones de gestión — invitar/remover sigue siendo
      // solo de "owner"); no se definen statements nuevos porque el
      // permiso que de verdad importa (escritura sobre Framework/etc.) lo
      // decide `requireWriteAccess` en packages/db/src/authz.ts, no el
      // access-control de Better Auth. Esto solo declara los roles para que
      // el cliente tipado (`authClient.organization.inviteMember`, etc.)
      // los acepte.
      roles: {
        owner: defaultRoles.owner,
        editor: defaultRoles.member,
        evaluador: defaultRoles.member,
      },
    }),
  ],
});
