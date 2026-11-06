"use client";

import Link from "next/link";

// Publicar = abrir la evaluacion vigente. Solo existe una a la vez: al
// publicar, la anterior se cierra. Todas las unidades activas participan; lo
// que ve cada una lo define el "Aplica a" de cada pregunta.

import { useEffect, useState } from "react";
import type { Evaluation } from "@plataforma-csa/sdk-core";
import { api } from "@/lib/api-client";
import { inputToDueDate } from "@/lib/due-date";
import { formatDueDate } from "@/lib/due-date";
import { Button, Pill } from "@/components/ui";

export function PublishPanel({ frameworkId, open, onClose }: { frameworkId: string; open: boolean; onClose: () => void }) {
  const [evaluations, setEvaluations] = useState<Evaluation[] | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = () =>
    api
      .get<{ evaluations: Evaluation[] }>(`/api/evaluations?frameworkId=${frameworkId}`)
      .then((r) => setEvaluations(r.evaluations))
      .catch(() => setEvaluations([]));

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, frameworkId]);

  if (!open) return null;

  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      await api.post("/api/evaluations", { frameworkId, ...(dueDate ? { dueDate: inputToDueDate(dueDate) } : {}) });
      setDone(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo publicar");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <>
      <div className="form-preview-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="form-preview-drawer" role="dialog" aria-modal="true" aria-label="Publicar">
        <div className="form-preview-drawer__head">
          <h3>Publicar evaluación</h3>
          <button type="button" className="form-preview-drawer__close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="form-preview publish-panel">
          <p>
            Al publicar, esta pasa a ser la <strong>evaluación vigente</strong> y la anterior se cierra. Todas las unidades activas la
            responden desde su cuenta; cada una ve solo las preguntas que le aplican.
          </p>
          <label className="field">
            <span className="field__label">Plazo (opcional)</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <Button type="button" variant="primary" onClick={() => void publish()} disabled={publishing}>
            {publishing ? "Publicando..." : "Publicar como vigente"}
          </Button>
          {error && <p className="alert" role="alert">{error}</p>}
          {done && (
            <p className="alert" role="status">
              Publicada. <Link href="/evaluations">Ver el avance de las unidades</Link>
            </p>
          )}
          <h4>Publicaciones anteriores de esta estructura</h4>
          {evaluations === null ? (
            <p className="empty">Cargando…</p>
          ) : evaluations.length === 0 ? (
            <p className="empty">Todavía no publicaste esta estructura.</p>
          ) : (
            <ul className="entry-list">
              {evaluations.map((ev, i) => {
                const closed = !!ev.dueDate && new Date(ev.dueDate) <= new Date();
                return (
                  <li key={ev.id} className="entry-list__row">
                    <span className="entry-list__main">
                      {formatDueDate(ev.publishedAt as unknown as string)}{" "}
                      {i === 0 && !closed ? <Pill variant="good">Vigente</Pill> : <Pill variant="warn">Cerrada</Pill>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
