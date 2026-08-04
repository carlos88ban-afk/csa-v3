"use client";

import type { Dimension, Indicator } from "@plataforma-csa/sdk-core";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

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

  if (!dimension || indicators === null) return <main>Cargando...</main>;

  return (
    <main>
      <p>
        <a href={`/frameworks/${frameworkId}`}>← {dimension.title ? "Framework" : ""}</a>
      </p>
      <h1>{dimension.title}</h1>
      {dimension.description && <p>{dimension.description}</p>}

      <h2>Indicadores</h2>
      {indicators.length === 0 ? (
        <p>Todavía no hay indicadores.</p>
      ) : (
        <ul>
          {indicators.map((ind) => (
            <li key={ind.id}>
              <a href={`/frameworks/${frameworkId}/dimensions/${dimensionId}/indicators/${ind.id}`}>
                {ind.title}
              </a>
            </li>
          ))}
        </ul>
      )}

      <h3>Nuevo indicador</h3>
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
