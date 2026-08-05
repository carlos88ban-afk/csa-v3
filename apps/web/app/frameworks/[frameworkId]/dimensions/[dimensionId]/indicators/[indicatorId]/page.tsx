"use client";

import type { Indicator, Subindicator } from "@plataforma-csa/sdk-core";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Breadcrumb, Button, Card, Pill } from "@/components/ui";

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

  if (!indicator || subindicators === null) return <main className="loading">Cargando...</main>;

  return (
    <main className="page">
      <Breadcrumb
        items={[
          { label: "Frameworks", href: "/frameworks" },
          { label: "Framework", href: `/frameworks/${frameworkId}` },
          { label: "Dimensión", href: `/frameworks/${frameworkId}/dimensions/${dimensionId}` },
          { label: indicator.title },
        ]}
      />
      <h1>{indicator.title}</h1>
      {indicator.description && <p>{indicator.description}</p>}

      <h2>Subindicadores</h2>
      <Card>
        {subindicators.length === 0 ? (
          <p className="empty">Todavía no hay subindicadores.</p>
        ) : (
          <ul className="entry-list">
            {subindicators.map((sub) => (
              <li key={sub.id} className="entry-list__row">
                {editingId === sub.id ? (
                  <>
                    <input value={editingTitle} onChange={(e) => setEditingTitle(e.target.value)} />
                    <span className="entry-list__actions">
                      <Button type="button" variant="primary" size="sm" onClick={() => handleSaveEdit(sub.id)}>
                        Guardar
                      </Button>
                      <Button type="button" size="sm" onClick={() => setEditingId(null)}>
                        Cancelar
                      </Button>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="entry-list__main">
                      <a
                        className="entry-list__title"
                        href={`/frameworks/${frameworkId}/dimensions/${dimensionId}/indicators/${indicatorId}/subindicators/${sub.id}`}
                      >
                        {sub.title}
                      </a>
                      <Pill>rev. {sub.revisionNumber}</Pill>
                    </span>
                    <span className="entry-list__actions">
                      <Button type="button" size="sm" onClick={() => startEdit(sub)}>
                        Editar
                      </Button>
                      <Button type="button" variant="danger" size="sm" onClick={() => handleDelete(sub.id)}>
                        Borrar
                      </Button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <h3>Nuevo subindicador</h3>
      <Card>
        <form className="form form--row" onSubmit={handleCreate}>
          <label className="field">
            <span className="field__label">Título</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <Button type="submit" variant="primary" disabled={submitting || title.trim().length === 0}>
            {submitting ? "Creando..." : "Crear"}
          </Button>
        </form>
        {error && <p className="alert" role="alert">{error}</p>}
      </Card>
    </main>
  );
}
