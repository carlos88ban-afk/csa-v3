import { organizationClient } from "better-auth/client/plugins";
import { defaultRoles } from "better-auth/plugins/organization/access";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    // Mismos roles que packages/db/src/auth.ts (VS-014, ver
    // docs/engines/permission.md) — el cliente tipado necesita conocerlos
    // para que llamadas como inviteMember({ role: "editor" }) compilen.
    organizationClient({
      roles: { owner: defaultRoles.owner, editor: defaultRoles.member, evaluador: defaultRoles.member },
    }),
  ],
});
