"use client";

import type { Framework } from "@plataforma-csa/sdk-core";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { Button, Card } from "@/components/ui";
import { DataTable, type DataTableColumn } from "@/components/data-table";

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
      // createFramework() en el backend no calcula dimensionCount (solo listFrameworks lo
      // agrega vía join) — un framework recién creado siempre empieza en 0 dimensiones.
      const { framework } = await api.post<{ framework: Omit<Framework, "dimensionCount"> }>("/api/frameworks", {
        name,
      });
      setFrameworks((prev) => [...(prev ?? []), { ...framework, dimensionCount: 0 }]);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el framework");
    } finally {
      setSubmitting(false);
    }
  }

  if (sessionPending || orgPending || !activeOrganization) return <main className="loading">Cargando...</main>;

  const columns: DataTableColumn<Framework>[] = [
    {
      key: "name",
      header: "Nombre",
      render: (fw) => (
        <a className="entry-list__title" href={`/frameworks/${fw.id}`}>
          {fw.name}
        </a>
      ),
    },
    {
      key: "dimensionCount",
      header: "Dimensiones",
      numeric: true,
      render: (fw) => fw.dimensionCount,
    },
  ];

  return (
    <main className="page">
      <h1>Frameworks — {activeOrganization.name}</h1>

      <Card>
        {frameworks === null ? (
          <p className="empty">Cargando frameworks...</p>
        ) : (
          <DataTable columns={columns} rows={frameworks} rowKey={(fw) => fw.id} emptyLabel="Todavía no hay frameworks." />
        )}
      </Card>

      <h2>Nuevo framework</h2>
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
