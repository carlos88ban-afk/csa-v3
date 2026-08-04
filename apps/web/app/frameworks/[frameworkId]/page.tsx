"use client";

import type { Dimension, Framework } from "@plataforma-csa/sdk-core";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

interface Props {
  params: Promise<{ frameworkId: string }>;
}

export default function FrameworkDetailPage({ params }: Props) {
  const { frameworkId } = use(params);
  const [framework, setFramework] = useState<Framework | null>(null);
  const [dimensions, setDimensions] = useState<Dimension[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<{ framework: Framework }>(`/api/frameworks/${frameworkId}`).then((res) => setFramework(res.framework));
    api
      .get<{ dimensions: Dimension[] }>(`/api/dimensions?frameworkId=${frameworkId}`)
      .then((res) => setDimensions(res.dimensions));
  }, [frameworkId]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { dimension } = await api.post<{ dimension: Dimension }>("/api/dimensions", {
        frameworkId,
        title,
      });
      setDimensions((prev) => [...(prev ?? []), dimension]);
      setTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la dimensión");
    } finally {
      setSubmitting(false);
    }
  }

  if (!framework || dimensions === null) return <main>Cargando...</main>;

  return (
    <main>
      <p>
        <a href="/frameworks">← Frameworks</a>
      </p>
      <h1>{framework.name}</h1>
      {framework.description && <p>{framework.description}</p>}

      <h2>Dimensiones</h2>
      {dimensions.length === 0 ? (
        <p>Todavía no hay dimensiones.</p>
      ) : (
        <ul>
          {dimensions.map((dim) => (
            <li key={dim.id}>
              <a href={`/frameworks/${frameworkId}/dimensions/${dim.id}`}>{dim.title}</a>
            </li>
          ))}
        </ul>
      )}

      <h3>Nueva dimensión</h3>
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
