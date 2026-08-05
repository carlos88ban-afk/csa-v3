import { and, eq } from "drizzle-orm";
import { auth } from "./auth.js";
import { db } from "./client.js";
import { member } from "./schema/auth.js";

export class AuthzError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "NO_ACTIVE_ORGANIZATION" | "NOT_A_MEMBER" | "FORBIDDEN",
  ) {
    super(code);
    this.name = "AuthzError";
  }
}

// Roles de member.role desde M11 (ver docs/engines/permission.md): "owner"
// es el que ya asigna Better Auth al crear la organización (no se renombra
// el string, solo se relabela "Dueño" en la UI); "editor"/"evaluador" son
// nuevos, reemplazan al "member" genérico de transición de VS-003.
const WRITE_ROLES = new Set(["owner", "editor"]);

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

/**
 * Igual que `requireActiveMember`, pero además exige que el rol tenga
 * permiso de escritura (`owner`/`editor` — `evaluador` es de solo lectura,
 * ver docs/engines/permission.md). Usar en POST/PATCH/DELETE del dominio;
 * las rutas GET siguen usando `requireActiveMember` directamente.
 */
export async function requireWriteAccess(
  headers: Headers,
): Promise<{ userId: string; organizationId: string; role: string }> {
  const ctx = await requireActiveMember(headers);
  if (!WRITE_ROLES.has(ctx.role)) {
    throw new AuthzError("FORBIDDEN");
  }
  return ctx;
}
