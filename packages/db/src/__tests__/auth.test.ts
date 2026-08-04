import { randomUUID } from "node:crypto";
import { applySetCookies } from "better-auth/cookies";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { auth, invitationEmailCallCount } from "../auth.js";
import { db } from "../client.js";
import { invitation, member, organization, user } from "../schema/auth.js";

// Estos tests corren contra el proyecto Neon real (docs/RISKS.md R-005).
// Cada dato creado usa un email/slug único por ejecución y se limpia en afterAll.
const runId = randomUUID().slice(0, 8);
const emailFor = (label: string) => `test-${runId}-${label}@example.com`;
const PASSWORD = "Sup3rSecret!23";

const createdUserIds = new Set<string>();
const createdOrgIds = new Set<string>();

async function signUpAndSignIn(email: string, name: string) {
  const signUp = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name } });
  createdUserIds.add(signUp.user.id);
  const signIn = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  // `signIn.headers` son headers de RESPUESTA (Set-Cookie). Para autenticar
  // las siguientes llamadas hay que convertirlos en un header `Cookie` de
  // REQUEST — de ahí `applySetCookies`, no reusar `signIn.headers` directo.
  const requestHeaders = new Headers();
  applySetCookies(requestHeaders, signIn.headers.getSetCookie());
  return { userId: signUp.user.id, headers: requestHeaders };
}

afterAll(async () => {
  for (const organizationId of createdOrgIds) {
    await db.delete(invitation).where(eq(invitation.organizationId, organizationId));
    await db.delete(member).where(eq(member.organizationId, organizationId));
    await db.delete(organization).where(eq(organization.id, organizationId));
  }
  for (const userId of createdUserIds) {
    await db.delete(user).where(eq(user.id, userId));
  }
});

describe("VS-003 — Auth + Organización (contra Neon real)", () => {
  it("registra un usuario nuevo", async () => {
    const email = emailFor("signup");
    const res = await auth.api.signUpEmail({
      body: { email, password: PASSWORD, name: "Test Signup" },
    });
    createdUserIds.add(res.user.id);
    expect(res.user.email).toBe(email);
  });

  it("permite login con credenciales correctas y rechaza credenciales incorrectas", async () => {
    const email = emailFor("login");
    const signUp = await auth.api.signUpEmail({
      body: { email, password: PASSWORD, name: "Test Login" },
    });
    createdUserIds.add(signUp.user.id);

    const signIn = await auth.api.signInEmail({ body: { email, password: PASSWORD } });
    expect(signIn.user.email).toBe(email);

    await expect(
      auth.api.signInEmail({ body: { email, password: "credencial-incorrecta" } }),
    ).rejects.toThrow();
  });

  it("crea una organización y el creador queda como owner", async () => {
    const { userId, headers } = await signUpAndSignIn(emailFor("org-owner"), "Owner");

    const org = await auth.api.createOrganization({
      body: { name: `Org ${runId}`, slug: `org-owner-${runId}` },
      headers,
    });
    expect(org).not.toBeNull();
    createdOrgIds.add(org!.id);

    const members = await auth.api.listMembers({
      query: { organizationId: org!.id },
      headers,
    });
    const ownerMembership = members.members.find((m) => m.userId === userId);
    expect(ownerMembership?.role).toBe("owner");
  });

  it("crear una invitación genera un token de aceptación y NUNCA envía email", async () => {
    const { headers } = await signUpAndSignIn(emailFor("org-inviter"), "Inviter");
    const org = await auth.api.createOrganization({
      body: { name: `Org Invite ${runId}`, slug: `org-invite-${runId}` },
      headers,
    });
    createdOrgIds.add(org!.id);

    const callsBefore = invitationEmailCallCount;
    const invite = await auth.api.createInvitation({
      body: {
        email: emailFor("invitee"),
        role: "member",
        organizationId: org!.id,
      },
      headers,
    });

    expect(invite.id).toBeTruthy();
    // El hook de invitación SÍ se dispara (así lo espera el plugin), pero es
    // un no-op que solo cuenta llamadas — nunca intenta enviar un email real.
    expect(invitationEmailCallCount).toBe(callsBefore + 1);
  });

  it("aceptar una invitación asigna el rol member al invitado", async () => {
    const { headers: ownerHeaders } = await signUpAndSignIn(emailFor("org-accept-owner"), "Owner");
    const org = await auth.api.createOrganization({
      body: { name: `Org Accept ${runId}`, slug: `org-accept-${runId}` },
      headers: ownerHeaders,
    });
    createdOrgIds.add(org!.id);

    const inviteeEmail = emailFor("accept-invitee");
    const invite = await auth.api.createInvitation({
      body: { email: inviteeEmail, role: "member", organizationId: org!.id },
      headers: ownerHeaders,
    });

    const { userId: inviteeId, headers: inviteeHeaders } = await signUpAndSignIn(
      inviteeEmail,
      "Invitee",
    );

    await auth.api.acceptInvitation({
      body: { invitationId: invite.id },
      headers: inviteeHeaders,
    });

    const members = await auth.api.listMembers({
      query: { organizationId: org!.id },
      headers: ownerHeaders,
    });
    const membership = members.members.find((m) => m.userId === inviteeId);
    expect(membership?.role).toBe("member");
  });

  it("tenant-scoping: un usuario que no es miembro no puede leer los miembros de la organización", async () => {
    const { headers: ownerHeaders } = await signUpAndSignIn(emailFor("org-scoped-owner"), "Owner");
    const org = await auth.api.createOrganization({
      body: { name: `Org Scoped ${runId}`, slug: `org-scoped-${runId}` },
      headers: ownerHeaders,
    });
    createdOrgIds.add(org!.id);

    const { headers: outsiderHeaders } = await signUpAndSignIn(
      emailFor("org-outsider"),
      "Outsider",
    );

    await expect(
      auth.api.listMembers({ query: { organizationId: org!.id }, headers: outsiderHeaders }),
    ).rejects.toThrow();
  });
});
