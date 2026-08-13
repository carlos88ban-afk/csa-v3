"use client";

import type { Dimension, Evaluation, Framework } from "@plataforma-csa/sdk-core";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Breadcrumb, Button, Card, Pill } from "@/components/ui";

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
  const [evaluations, setEvaluations] = useState<Evaluation[] | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ framework: Framework }>(`/api/frameworks/${frameworkId}`).then((res) => setFramework(res.framework));
    api
      .get<{ dimensions: Dimension[] }>(`/api/dimensions?frameworkId=${frameworkId}`)
      .then((res) => setDimensions(res.dimensions));
    api
      .get<{ evaluations: Evaluation[] }>(`/api/evaluations?frameworkId=${frameworkId}`)
      .then((res) => setEvaluations(res.evaluations));
  }, [frameworkId]);

  async function handlePublish() {
    setPublishError(null);
    setPublishing(true);
    try {
      const { evaluation } = await api.post<{ evaluation: Evaluation }>("/api/evaluations", { frameworkId });
      setEvaluations((prev) => [...(prev ?? []), evaluation]);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "No se pudo publicar");
    } finally {
      setPublishing(false);
    }
  }

  async function handleRevoke(id: string) {
    await api.del(`/api/evaluations/${id}`);
    setEvaluations((prev) => (prev ?? []).filter((e) => e.id !== id));
  }

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

  if (!framework || dimensions === null || evaluations === null) return <main className="loading">Cargando...</main>;

  return (
    <main className="page">
      <Breadcrumb items={[{ label: "Frameworks", href: "/frameworks" }, { label: framework.name }]} />
      <h1>{framework.name}</h1>
      {framework.description && <p>{framework.description}</p>}

      <h2>Dimensiones</h2>
      <Card>
        {dimensions.length === 0 ? (
          <p className="empty">Todavía no hay dimensiones.</p>
        ) : (
          <ul className="entry-list">
            {dimensions.map((dim) => (
              <li key={dim.id} className="entry-list__row">
                <a className="entry-list__title" href={`/frameworks/${frameworkId}/builder?s=${dim.id}`}>
                  {dim.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <h3>Nueva dimensión</h3>
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

      {/* Workspace split-view del Builder (VS-031, docs/slices/VS-031.md):
          árbol de estructura + editor en un solo lugar. */}
      <h2>Editor</h2>
      <Card>
        <p className="runtime-instruction">
          Workspace con el árbol del framework a la izquierda y el formulario del subindicador seleccionado a la derecha.
        </p>
        <a className="btn btn--primary" href={`/frameworks/${frameworkId}/builder`}>
          Abrir editor
        </a>
      </Card>

      <h2>Publicación</h2>
      <Card>
        <Button type="button" variant="primary" onClick={handlePublish} disabled={publishing}>
          {publishing ? "Publicando..." : "Publicar"}
        </Button>
        {publishError && <p className="alert" role="alert">{publishError}</p>}
        {evaluations.length === 0 ? (
          <p className="empty">Todavía no se publicó ninguna evaluación.</p>
        ) : (
          <ul className="entry-list">
            {evaluations.map((ev) => (
              <li key={ev.id} className="entry-list__row">
                <span className="entry-list__main">
                  <Pill variant="good">Publicada</Pill>
                  <a href={`/evaluations/${ev.token}`}>{`/evaluations/${ev.token}`}</a>
                </span>
                <span className="entry-list__actions">
                  <a href={`/frameworks/${frameworkId}/evaluations/${ev.id}/review`}>Revisar</a>
                  <a href={`/api/evaluations/${ev.id}/export`}>Exportar CSV</a>
                  <Button type="button" variant="danger" size="sm" onClick={() => handleRevoke(ev.id)}>
                    Revocar
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
