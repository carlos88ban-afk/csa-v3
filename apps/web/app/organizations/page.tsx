"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Card, Pill } from "@/components/ui";
import { DataTable, type DataTableColumn } from "@/components/data-table";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const ROLE_LABEL: Record<string, string> = { owner: "Dueño", editor: "Editor", evaluador: "Evaluador" };

interface OrgMember {
  id: string;
  role: string;
  user: { email: string; name?: string };
}

export default function OrganizationsPage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const { data: organizations, isPending: orgsPending, refetch } = authClient.useListOrganizations();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Miembros/invitaciones (VS-014, ver docs/engines/permission.md) — sin
  // ruta API propia, usa directamente el cliente de organización de Better
  // Auth (mismo patrón que "Crear organización nueva" arriba).
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "evaluador">("editor");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);

  // Conteo de miembros por organización (VS-036, docs/architecture/design-system.md
  // "Layout") — Better Auth no expone un conteo en useListOrganizations(), así que se
  // pide una vez por organización en paralelo (sin nueva ruta propia, mismo cliente
  // que ya se usa para los miembros de la organización activa más abajo).
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!organizations || organizations.length === 0) return;
    let alive = true;
    void Promise.all(
      organizations.map((org) =>
        authClient.organization
          .listMembers({ query: { organizationId: org.id } })
          .then(({ data }) => [org.id, data?.members?.length ?? 0] as const),
      ),
    ).then((entries) => {
      if (alive) setMemberCounts(Object.fromEntries(entries));
    });
    return () => {
      alive = false;
    };
  }, [organizations]);

  useEffect(() => {
    if (!sessionPending && !session) {
      router.push("/login");
    }
  }, [sessionPending, session, router]);

  useEffect(() => {
    if (!activeOrganization) {
      setMembers(null);
      return;
    }
    void authClient.organization
      .listMembers({ query: { organizationId: activeOrganization.id } })
      .then(({ data }) => setMembers((data?.members as OrgMember[] | undefined) ?? []));
  }, [activeOrganization]);

  const currentRole = members?.find((m) => m.user.email === session?.user.email)?.role;
  const isOwner = currentRole === "owner";

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!activeOrganization) return;
    setInviteError(null);
    setInviteLink(null);
    setInviting(true);
    const { data, error: err } = await authClient.organization.inviteMember({
      email: inviteEmail,
      role: inviteRole,
      organizationId: activeOrganization.id,
    });
    setInviting(false);
    if (err) {
      setInviteError(err.message ?? "No se pudo invitar");
      return;
    }
    if (data?.id) setInviteLink(`${window.location.origin}/accept-invitation/${data.id}`);
    setInviteEmail("");
  }

  async function handleRoleChange(memberId: string, role: string) {
    if (!activeOrganization) return;
    setMemberError(null);
    const { error: err } = await authClient.organization.updateMemberRole({
      memberId,
      role,
      organizationId: activeOrganization.id,
    });
    if (err) {
      setMemberError(err.message ?? "No se pudo cambiar el rol");
      return;
    }
    setMembers((prev) => prev?.map((m) => (m.id === memberId ? { ...m, role } : m)) ?? null);
  }

  async function handleRemoveMember(memberId: string) {
    if (!activeOrganization) return;
    setMemberError(null);
    const { error: err } = await authClient.organization.removeMember({
      memberIdOrEmail: memberId,
      organizationId: activeOrganization.id,
    });
    if (err) {
      setMemberError(err.message ?? "No se pudo quitar al miembro");
      return;
    }
    setMembers((prev) => prev?.filter((m) => m.id !== memberId) ?? null);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const { data: org, error: createError } = await authClient.organization.create({
      name,
      slug: slugify(name),
    });
    if (createError) {
      setSubmitting(false);
      setError(createError.message ?? "No se pudo crear la organización");
      return;
    }
    if (org) {
      await authClient.organization.setActive({ organizationId: org.id });
    }
    setSubmitting(false);
    setName("");
    await refetch();
  }

  async function handleSetActive(organizationId: string) {
    await authClient.organization.setActive({ organizationId });
  }

  if (sessionPending || !session) return <main className="loading">Cargando...</main>;

  type OrgRow = NonNullable<typeof organizations>[number];
  const orgColumns: DataTableColumn<OrgRow>[] = [
    {
      key: "name",
      header: "Nombre",
      render: (org) => (
        <span className="entry-list__main">
          {org.name}
          {activeOrganization?.id === org.id && <Pill variant="accent">Activa</Pill>}
        </span>
      ),
    },
    {
      key: "members",
      header: "Miembros",
      numeric: true,
      render: (org) => memberCounts[org.id] ?? "…",
    },
    {
      key: "action",
      header: "",
      render: (org) =>
        activeOrganization?.id !== org.id ? (
          <Button type="button" size="sm" onClick={() => handleSetActive(org.id)}>
            Usar esta
          </Button>
        ) : null,
    },
  ];

  return (
    <main className="page">
      <h1>Tus organizaciones</h1>
      {activeOrganization && (
        <p>
          Organización activa: <strong>{activeOrganization.name}</strong> — <a href="/frameworks">ir a Frameworks</a>
        </p>
      )}

      <Card>
        {orgsPending ? (
          <p className="empty">Cargando organizaciones...</p>
        ) : (
          <DataTable
            columns={orgColumns}
            rows={organizations ?? []}
            rowKey={(org) => org.id}
            emptyLabel="Todavía no perteneces a ninguna organización."
          />
        )}
      </Card>

      <h2>Crear organización nueva</h2>
      <Card>
        <form className="form form--row" onSubmit={handleCreate}>
          <label className="field">
            <span className="field__label">Nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <Button type="submit" variant="primary" disabled={submitting || name.trim().length === 0}>
            {submitting ? "Creando..." : "Crear"}
          </Button>
        </form>
        {error && <p className="alert" role="alert">{error}</p>}
      </Card>

      {activeOrganization && (
        <>
          <h2>Miembros de {activeOrganization.name}</h2>
          <Card>
            {members === null ? (
              <p className="empty">Cargando miembros...</p>
            ) : (
              <ul className="entry-list">
                {members.map((m) => (
                  <li key={m.id} className="entry-list__row">
                    <span className="entry-list__main">
                      {m.user.email}
                      <Pill variant={m.role === "owner" ? "accent" : "neutral"}>{ROLE_LABEL[m.role] ?? m.role}</Pill>
                    </span>
                    {isOwner && m.role !== "owner" && (
                      <span className="entry-list__actions">
                        <select value={m.role} onChange={(e) => handleRoleChange(m.id, e.target.value)}>
                          <option value="editor">Editor</option>
                          <option value="evaluador">Evaluador</option>
                        </select>
                        <Button type="button" variant="danger" size="sm" onClick={() => handleRemoveMember(m.id)}>
                          Quitar
                        </Button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {memberError && <p className="alert" role="alert">{memberError}</p>}
          </Card>

          {isOwner && (
            <>
              <h3>Invitar miembro</h3>
              <Card>
                <form className="form form--row" onSubmit={handleInvite}>
                  <label className="field">
                    <span className="field__label">Email</span>
                    <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
                  </label>
                  <label className="field">
                    <span className="field__label">Rol</span>
                    <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "editor" | "evaluador")}>
                      <option value="editor">Editor</option>
                      <option value="evaluador">Evaluador</option>
                    </select>
                  </label>
                  <Button type="submit" variant="primary" disabled={inviting || inviteEmail.trim().length === 0}>
                    {inviting ? "Invitando..." : "Invitar"}
                  </Button>
                </form>
                {inviteError && <p className="alert" role="alert">{inviteError}</p>}
                {inviteLink && (
                  <p>
                    Comparte este link manualmente (sin envío de email, ver <code>organization-user.md</code>):{" "}
                    <a href={inviteLink}>{inviteLink}</a>
                  </p>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </main>
  );
}
