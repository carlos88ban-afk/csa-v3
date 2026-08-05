"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Card, Pill } from "@/components/ui";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function OrganizationsPage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const { data: organizations, isPending: orgsPending, refetch } = authClient.useListOrganizations();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!sessionPending && !session) {
      router.push("/login");
    }
  }, [sessionPending, session, router]);

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
        ) : organizations && organizations.length > 0 ? (
          <ul className="entry-list">
            {organizations.map((org) => (
              <li key={org.id} className="entry-list__row">
                <span className="entry-list__main">
                  {org.name}
                  {activeOrganization?.id === org.id && <Pill variant="accent">Activa</Pill>}
                </span>
                {activeOrganization?.id !== org.id && (
                  <Button type="button" size="sm" onClick={() => handleSetActive(org.id)}>
                    Usar esta
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Todavía no perteneces a ninguna organización.</p>
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
    </main>
  );
}
