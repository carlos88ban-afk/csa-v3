import { and, eq } from "drizzle-orm";
import { auth } from "./auth.js";
import { db } from "./client.js";
import { member } from "./schema/auth.js";

export class AuthzError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "NO_ACTIVE_ORGANIZATION" | "NOT_A_MEMBER",
  ) {
    super(code);
    this.name = "AuthzError";
  }
}

/**
 * Resuelve la sesión de `headers` y confirma que el usuario es miembro de su
 * organización activa. Ver docs/domain/evaluation-hierarchy.md — cualquier
 * member/owner puede operar en M2; RBAC granular es M11.
 */
export async function requireActiveMember(
  headers: Headers,
): Promise<{ userId: string; organizationId: string; role: string }> {
  const session = await auth.api.getSession({ headers });
  if (!session) {
    throw new AuthzError("UNAUTHENTICATED");
  }

  const organizationId = (session.session as { activeOrganizationId?: string | null })
    .activeOrganizationId;
  if (!organizationId) {
    throw new AuthzError("NO_ACTIVE_ORGANIZATION");
  }

  const [membership] = await db
    .select()
    .from(member)
    .where(and(eq(member.userId, session.user.id), eq(member.organizationId, organizationId)));

  if (!membership) {
    throw new AuthzError("NOT_A_MEMBER");
  }

  return { userId: session.user.id, organizationId, role: membership.role };
}
