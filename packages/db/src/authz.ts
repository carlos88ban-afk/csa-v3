import { and, eq } from "drizzle-orm";
import { auth } from "./auth.js";
import { db } from "./client.js";
import { member, organization } from "./schema/auth.js";

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
const WRITE_ROLES = new Set(["owner"]);

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

  let organizationId = (session.session as { activeOrganizationId?: string | null })
    .activeOrganizationId;
  if (!organizationId) {
    // Un usuario pertenece a una sola organización/unidad: sin sesión activa
    // se resuelve por su única membresía.
    const [first] = await db.select().from(member).where(eq(member.userId, session.user.id));
    organizationId = first?.organizationId ?? null;
  }
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

/**
 * VS-054 (docs/domain/business-units.md, "Panel Publicar"): devuelve las
 * organizaciones hijas (unidades de negocio) de una organización matriz.
 */
export async function listChildOrganizations(parentOrganizationId: string) {
  const { organization } = await import("./schema/auth.js");
  const { eq } = await import("drizzle-orm");
  return db.select().from(organization).where(eq(organization.parentOrganizationId, parentOrganizationId));
}

export type AppRole = "corporate_admin" | "unit_admin" | "evaluator";

export interface AppContext {
  userId: string;
  userName: string;
  organizationId: string;
  role: string;
  appRole: AppRole;
  /** Organización corporativa (matriz) a la que pertenece el usuario. */
  corporateOrgId: string;
  /** Unidad de negocio del usuario; null para administradores corporativos. */
  unitId: string | null;
}

/**
 * Contexto de producto: Corporate Admin (owner de la organización matriz),
 * Unit Admin y Evaluator (miembros de una unidad = organización hija).
 */
export async function getAppContext(headers: Headers): Promise<AppContext> {
  const base = await requireActiveMember(headers);
  const session = await auth.api.getSession({ headers });
  const [org] = await db.select().from(organization).where(eq(organization.id, base.organizationId));
  if (!org) throw new AuthzError("NO_ACTIVE_ORGANIZATION");
  const userName = session?.user.name || session?.user.email || "Usuario";
  if (!org.parentOrganizationId) {
    if (base.role !== "owner") throw new AuthzError("FORBIDDEN");
    return { ...base, userName, appRole: "corporate_admin", corporateOrgId: org.id, unitId: null };
  }
  if (!org.active) throw new AuthzError("FORBIDDEN");
  const appRole: AppRole = base.role === "unit_admin" ? "unit_admin" : "evaluator";
  return { ...base, userName, appRole, corporateOrgId: org.parentOrganizationId, unitId: org.id };
}

export async function requireCorporateAdmin(headers: Headers): Promise<AppContext> {
  const ctx = await getAppContext(headers);
  if (ctx.appRole !== "corporate_admin") throw new AuthzError("FORBIDDEN");
  return ctx;
}

export async function requireUnitMember(headers: Headers): Promise<AppContext & { unitId: string }> {
  const ctx = await getAppContext(headers);
  if (!ctx.unitId) throw new AuthzError("FORBIDDEN");
  return ctx as AppContext & { unitId: string };
}
