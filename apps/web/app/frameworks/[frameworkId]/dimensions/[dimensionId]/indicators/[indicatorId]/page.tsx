"use client";

import type { Indicator, Subindicator } from "@plataforma-csa/sdk-core";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

interface Props {
  params: Promise<{ frameworkId: string; dimensionId: string; indicatorId: string }>;
}

export default function IndicatorDetailPage({ params }: Props) {
  const { frameworkId, dimensionId, indicatorId } = use(params);
  const [indicator, setIndicator] = useState<Indicator | null>(null);
  const [subindicators, setSubindicators] = useState<Subindicator[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  useEffect(() => {
    api.get<{ indicator: Indicator }>(`/api/indicators/${indicatorId}`).then((res) => setIndicator(res.indicator));
    api
      .get<{ subindicators: Subindicator[] }>(`/api/subindicators?indicatorId=${indicatorId}`)
      .then((res) => setSubindicators(res.subindicators));
  }, [indicatorId]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { subindicator } = await api.post<{ subindicator: Subindicator }>("/api/subindicators", {
        indicatorId,
        title,
      });
      setSubindicators((prev) => [...(prev ?? []), subindicator]);
      setTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el subindicador");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(sub: Subindicator) {
    setEditingId(sub.id);
    setEditingTitle(sub.title);
  }

  async function handleSaveEdit(id: string) {
    const { subindicator } = await api.patch<{ subindicator: Subindicator }>(`/api/subindicators/${id}`, {
      title: editingTitle,
    });
    setSubindicators((prev) => (prev ?? []).map((s) => (s.id === id ? subindicator : s)));
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    await api.del(`/api/subindicators/${id}`);
    setSubindicators((prev) => (prev ?? []).filter((s) => s.id !== id));
  }

  if (!indicator || subindicators === null) return <main>Cargando...</main>;

  return (
    <main>
      <p>
        <a href={`/frameworks/${frameworkId}/dimensions/${dimensionId}`}>← Dimensión</a>
      </p>
      <h1>{indicator.title}</h1>
      {indicator.description && <p>{indicator.description}</p>}

      <h2>Subindicadores</h2>
      {subindicators.length === 0 ? (
        <p>Todavía no hay subindicadores.</p>
      ) : (
        <ul>
          {subindicators.map((sub) => (
            <li key={sub.id}>
              {editingId === sub.id ? (
                <>
                  <input value={editingTitle} onChange={(e) => setEditingTitle(e.target.value)} />
                  <button type="button" onClick={() => handleSaveEdit(sub.id)}>
                    Guardar
                  </button>
                  <button type="button" onClick={() => setEditingId(null)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  {sub.title} (rev. {sub.revisionNumber}){" "}
                  <a href={`/frameworks/${frameworkId}/dimensions/${dimensionId}/indicators/${indicatorId}/subindicators/${sub.id}`}>
                    Abrir formulario
                  </a>{" "}
                  <button type="button" onClick={() => startEdit(sub)}>
                    Editar
                  </button>{" "}
                  <button type="button" onClick={() => handleDelete(sub.id)}>
                    Borrar
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3>Nuevo subindicador</h3>
      <form onSubmit={handleCreate}>
        <label>
          Título
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting || title.trim().length === 0}>
          {submitting ? "Creando..." : "Crear"}
        </button>
      </form>
    </main>
  );
}
