"use client";

import Link from "next/link";
import type { Framework } from "@plataforma-csa/sdk-core";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useCachedGet } from "@/lib/api-cache";
import { Button, Card } from "@/components/ui";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { useMe } from "@/lib/use-me";

// "Estructura": las evaluaciones (una por año) con sus bloques y preguntas.
// Duplicar copia todo para armar la del año siguiente.
export default function FrameworksPage() {
  const { me, loading } = useMe();
  const { data: fwData, reload } = useCachedGet<{ frameworks: Framework[] }>("/api/frameworks");
  const frameworks = fwData?.frameworks ?? null;
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState<{ id: string; name: string } | null>(null);

  const load = reload;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/api/frameworks", { name });
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear");
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    if (!dup) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ id: string }>(`/api/frameworks/${dup.id}/duplicate`, { name: dup.name });
      window.location.href = `/frameworks/${res.id}/builder`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo duplicar");
      setBusy(false);
    }
  }

  if (me.appRole !== "corporate_admin") return <main className="page">Solo el administrador corporativo edita la estructura.</main>;

  const columns: DataTableColumn<Framework>[] = [
    {
      key: "name",
      header: "Evaluación",
      render: (fw) => (
        <Link className="entry-list__title" href={`/frameworks/${fw.id}/builder`}>
          {fw.name}
        </Link>
      ),
    },
    { key: "dimensionCount", header: "Dimensiones", numeric: true, render: (fw) => fw.dimensionCount },
    {
      key: "actions",
      header: "",
      render: (fw) => (
        <Button size="sm" onClick={() => setDup({ id: fw.id, name: `${fw.name} (siguiente año)` })}>
          Duplicar para el próximo año
        </Button>
      ),
    },
  ];

  return (
    <main className="page">
      <h1>Estructura de la evaluación</h1>
      <p className="page__lead">
        Una evaluación por año. Para la siguiente, duplica la anterior: se copian dimensiones, indicadores, subindicadores y preguntas, y solo ajustas lo que cambie.
      </p>
      {error && <p className="alert" role="alert">{error}</p>}
      {dup && (
        <Card>
          <label className="field">
            <span className="field__label">Nombre de la copia</span>
            <input value={dup.name} onChange={(e) => setDup({ ...dup, name: e.target.value })} />
          </label>
          <Button variant="primary" disabled={busy || !dup.name.trim()} onClick={() => void duplicate()}>
            {busy ? "Duplicando..." : "Duplicar"}
          </Button>{" "}
          <Button onClick={() => setDup(null)}>Cancelar</Button>
        </Card>
      )}
      <Card>
        {frameworks === null ? (
          <p className="empty">Cargando...</p>
        ) : (
          <DataTable columns={columns} rows={frameworks} rowKey={(fw) => fw.id} emptyLabel="Todavía no hay una evaluación. Crea la primera abajo." />
        )}
      </Card>
      <h2>Nueva evaluación desde cero</h2>
      <Card>
        <form className="form form--row" onSubmit={create}>
          <label className="field">
            <span className="field__label">Nombre (por ejemplo, CSA 2027)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>Crear</Button>
        </form>
      </Card>
    </main>
  );
}
