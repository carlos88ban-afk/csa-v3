import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { defaultRoles } from "better-auth/plugins/organization/access";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "./client.js";
import * as schema from "./schema/auth.js";
import { emailTemplates, sendEmail } from "./email.js";

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
async function sendInvitationEmail(data: {
  id: string;
  email: string;
  inviter: { user: { name?: string | null; email: string } };
  organization: { name: string };
}) {
  invitationEmailCallCount += 1;
  const base = process.env.BETTER_AUTH_URL ?? "";
  const tpl = emailTemplates.invitation({
    organization: data.organization.name,
    inviter: data.inviter.user.name || data.inviter.user.email,
    url: `${base}/accept-invitation/${data.id}`,
  });
  await sendEmail({ to: data.email, ...tpl });
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
  },
  databaseHooks: {
    session: {
      create: {
        // Cada usuario pertenece a una sola unidad: al iniciar sesion su
        // organizacion activa es esa (o la corporativa para administradores).
        before: async (session: { userId: string }) => {
          // Determinista: si el usuario tiene varias membresías, gana la organización con más
          // unidades hijas (la corporativa con datos); a igualdad, la membresía más antigua.
          // Sin orden explícito Postgres devolvía una u otra y el administrador veía datos distintos.
          const [m] = await db
            .select()
            .from(schema.member)
            .where(eq(schema.member.userId, session.userId))
            .orderBy(
              desc(sql`(select count(*) from organization c where c.parent_organization_id = ${schema.member.organizationId})`),
              asc(schema.member.createdAt),
            );
          return { data: { ...session, activeOrganizationId: m?.organizationId ?? null } };
        },
      },
    },
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
        unit_admin: defaultRoles.member,
        evaluator: defaultRoles.member,
      },
      // Jerarquía matriz/unidad de negocio de M14 (VS-050, ver
      // docs/domain/business-units.md). `parentOrganizationId` vive en la
      // tabla `organization` (generada por Better Auth) vía este mecanismo
      // de extensión de schema del plugin, en vez de editar
      // schema/auth.ts a mano — ese archivo se regenera con
      // `pnpm db:generate-auth-schema` y perdería cualquier edición manual.
      schema: {
        organization: {
          additionalFields: {
            sigla: { type: "string", required: false },
            active: { type: "boolean", required: false, defaultValue: true },
            parentOrganizationId: {
              type: "string",
              required: false,
              references: { model: "organization", field: "id" },
            },
          },
        },
      },
    }),
  ],
});
