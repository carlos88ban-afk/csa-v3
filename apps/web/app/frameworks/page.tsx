"use client";

import type { Framework } from "@plataforma-csa/sdk-core";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";

export default function FrameworksPage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const { data: activeOrganization, isPending: orgPending } = authClient.useActiveOrganization();
  const [frameworks, setFrameworks] = useState<Framework[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!sessionPending && !session) {
      router.push("/login");
    }
  }, [sessionPending, session, router]);

  useEffect(() => {
    if (!orgPending && !activeOrganization) {
      router.push("/organizations");
    }
  }, [orgPending, activeOrganization, router]);

  useEffect(() => {
    if (activeOrganization) {
      api.get<{ frameworks: Framework[] }>("/api/frameworks").then((res) => setFrameworks(res.frameworks));
    }
  }, [activeOrganization]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { framework } = await api.post<{ framework: Framework }>("/api/frameworks", { name });
      setFrameworks((prev) => [...(prev ?? []), framework]);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el framework");
    } finally {
      setSubmitting(false);
    }
  }

  if (sessionPending || orgPending || !activeOrganization) return <main>Cargando...</main>;

  return (
    <main>
      <h1>Frameworks — {activeOrganization.name}</h1>

      {frameworks === null ? (
        <p>Cargando frameworks...</p>
      ) : frameworks.length === 0 ? (
        <p>Todavía no hay frameworks.</p>
      ) : (
        <ul>
          {frameworks.map((fw) => (
            <li key={fw.id}>
              <a href={`/frameworks/${fw.id}`}>{fw.name}</a>
            </li>
          ))}
        </ul>
      )}

      <h2>Nuevo framework</h2>
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
