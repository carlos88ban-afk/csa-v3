"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

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

  if (sessionPending || !session) return <main>Cargando...</main>;

  return (
    <main>
      <h1>Tus organizaciones</h1>
      {activeOrganization && (
        <p>
          Organización activa: <strong>{activeOrganization.name}</strong> —{" "}
          <a href="/frameworks">ir a Frameworks</a>
        </p>
      )}

      {orgsPending ? (
        <p>Cargando organizaciones...</p>
      ) : organizations && organizations.length > 0 ? (
        <ul>
          {organizations.map((org) => (
            <li key={org.id}>
              {org.name}{" "}
              {activeOrganization?.id !== org.id && (
                <button type="button" onClick={() => handleSetActive(org.id)}>
                  Usar esta
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>Todavía no perteneces a ninguna organización.</p>
      )}

      <h2>Crear organización nueva</h2>
      <form onSubmit={handleCreate}>
        <label>
          Nombre
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting || name.trim().length === 0}>
          {submitting ? "Creando..." : "Crear"}
        </button>
      </form>
    </main>
  );
}
