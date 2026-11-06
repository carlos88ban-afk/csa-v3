"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Button, Card, Pill } from "@/components/ui";
import { useMe } from "@/lib/use-me";

interface Inquiry {
  id: string;
  subject: string;
  body: string;
  status: string;
  answer: string | null;
  answeredByName: string | null;
  answeredAt: string | null;
  createdAt: string;
  authorName: string;
  unitName: string;
  unitSigla: string | null;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function ConsultasPage() {
  const { me, loading } = useMe();
  const [items, setItems] = useState<Inquiry[] | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | "open" | "answered">("all");
  const [error, setError] = useState<string | null>(null);

  const load = () => api.get<{ inquiries: Inquiry[] }>("/api/inquiries").then((r) => setItems(r.inquiries));
  useEffect(() => {
    if (me) void load();
  }, [me]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/api/inquiries", { subject, body });
      setSubject("");
      setBody("");
      await load();
    } catch {
      setError("No se pudo enviar la consulta.");
    }
  }
  async function answer(id: string) {
    setError(null);
    try {
      await api.patch(`/api/inquiries/${id}`, { answer: answers[id] ?? "" });
      setAnswers({ ...answers, [id]: "" });
      await load();
    } catch {
      setError("Escribe una respuesta antes de enviar.");
    }
  }

  if (loading || !me) return <main className="loading">Cargando...</main>;
  const isCorp = me.appRole === "corporate_admin";
  const shown = (items ?? []).filter((i) => filter === "all" || i.status === filter);

  return (
    <main className="page">
      <h1>{isCorp ? "Bandeja de consultas" : "Consultas"}</h1>
      <p className="page__lead">
        {isCorp
          ? "Dudas de las unidades. No forman parte de la evaluación ni se exportan."
          : "¿Tienes una duda? Escríbela aquí y el equipo corporativo te responderá. No forma parte de tu evaluación."}
      </p>
      {error && <p className="alert" role="alert">{error}</p>}
      {!isCorp && (
        <Card>
          <form onSubmit={create}>
            <label className="field">
              <span className="field__label">Asunto</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={200} />
            </label>
            <label className="field">
              <span className="field__label">Tu consulta</span>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} required style={{ width: "100%" }} />
            </label>
            <Button type="submit" variant="primary">Enviar consulta</Button>
          </form>
        </Card>
      )}
      <p>
        <label>
          Ver:{" "}
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">Todas</option>
            <option value="open">Pendientes</option>
            <option value="answered">Respondidas</option>
          </select>
        </label>
      </p>
      {items === null ? (
        <p className="empty">Cargando...</p>
      ) : shown.length === 0 ? (
        <Card><p className="empty">No hay consultas.</p></Card>
      ) : (
        shown.map((i) => (
          <Card key={i.id}>
            <h3>
              {i.subject}{" "}
              {i.status === "answered" ? <Pill variant="good">Respondida</Pill> : <Pill variant="warn">Pendiente</Pill>}
            </h3>
            <p style={{ whiteSpace: "pre-wrap" }}>{i.body}</p>
            <p className="comment-preview">
              {i.authorName} · {i.unitSigla ?? i.unitName} · {fmt(i.createdAt)}
            </p>
            {i.answer && (
              <p className="comment-preview" style={{ whiteSpace: "pre-wrap" }}>
                <strong>Respuesta de {i.answeredByName}{i.answeredAt ? ` (${fmt(i.answeredAt)})` : ""}:</strong> {i.answer}
              </p>
            )}
            {isCorp && i.status === "open" && (
              <div>
                <textarea
                  value={answers[i.id] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [i.id]: e.target.value })}
                  rows={2}
                  style={{ width: "100%" }}
                  placeholder="Escribe la respuesta"
                />
                <Button size="sm" variant="primary" onClick={() => void answer(i.id)}>Responder</Button>
              </div>
            )}
          </Card>
        ))
      )}
    </main>
  );
}
