"use client";

import type { Dimension, Indicator } from "@plataforma-csa/sdk-core";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Breadcrumb, Button, Card } from "@/components/ui";

interface Props {
  params: Promise<{ frameworkId: string; dimensionId: string }>;
}

export default function DimensionDetailPage({ params }: Props) {
  const { frameworkId, dimensionId } = use(params);
  const [dimension, setDimension] = useState<Dimension | null>(null);
  const [indicators, setIndicators] = useState<Indicator[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<{ dimension: Dimension }>(`/api/dimensions/${dimensionId}`).then((res) => setDimension(res.dimension));
    api
      .get<{ indicators: Indicator[] }>(`/api/indicators?dimensionId=${dimensionId}`)
      .then((res) => setIndicators(res.indicators));
  }, [dimensionId]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { indicator } = await api.post<{ indicator: Indicator }>("/api/indicators", {
        dimensionId,
        title,
      });
      setIndicators((prev) => [...(prev ?? []), indicator]);
      setTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el indicador");
    } finally {
      setSubmitting(false);
    }
  }

  if (!dimension || indicators === null) return <main className="loading">Cargando...</main>;

  return (
    <main className="page">
      <Breadcrumb
        items={[
          { label: "Frameworks", href: "/frameworks" },
          { label: "Framework", href: `/frameworks/${frameworkId}` },
          { label: dimension.title },
        ]}
      />
      <h1>{dimension.title}</h1>
      {dimension.description && <p>{dimension.description}</p>}

      <h2>Indicadores</h2>
      <Card>
        {indicators.length === 0 ? (
          <p className="empty">Todavía no hay indicadores.</p>
        ) : (
          <ul className="entry-list">
            {indicators.map((ind) => (
              <li key={ind.id} className="entry-list__row">
                <a
                  className="entry-list__title"
                  href={`/frameworks/${frameworkId}/dimensions/${dimensionId}/indicators/${ind.id}`}
                >
                  {ind.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <h3>Nuevo indicador</h3>
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
