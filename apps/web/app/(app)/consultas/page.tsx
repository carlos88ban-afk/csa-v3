"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useCachedGet } from "@/lib/api-cache";
import { Button, Card, Pill } from "@/components/ui";
import { useMe } from "@/lib/use-me";
import { FilterBar, Highlight, NoResults, matchesText } from "@/components/filter-bar";

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
  const { data: inqData, reload } = useCachedGet<{ inquiries: Inquiry[] }>("/api/inquiries");
  const items = inqData?.inquiries ?? null;
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | "open" | "answered">("all");
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [unitF, setUnitF] = useState("");

  const load = reload;

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

  const isCorp = me.appRole === "corporate_admin";
  const all = items ?? [];
  const unitsInList = [...new Map(all.map((i) => [i.unitSigla ?? i.unitName, i.unitSigla ?? i.unitName])).values()].sort();
  const base = all.filter((i) => matchesText(q, i.subject, i.body, i.authorName, i.answer) && (!unitF || (i.unitSigla ?? i.unitName) === unitF));
  const count = { all: base.length, open: base.filter((i) => i.status === "open").length, answered: base.filter((i) => i.status === "answered").length };
  // Pendientes primero; dentro de cada grupo, la más reciente arriba.
  const shown = base
    .filter((i) => filter === "all" || i.status === filter)
    .sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === "open" ? -1 : 1));
  const filtering = !!(q || unitF || filter !== "all");
  const clear = () => { setQ(""); setUnitF(""); setFilter("all"); };

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
      <FilterBar query={q} onQuery={setQ} placeholder="Buscar en asunto, texto o autor…" shown={shown.length} total={all.length} active={filtering} onClear={clear}>
        <span className="fbar__chips">
          {([["all", "Todas"], ["open", "Pendientes"], ["answered", "Respondidas"]] as const).map(([k, label]) => (
            <button key={k} type="button" className="fbar__chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {label} ({count[k]})
            </button>
          ))}
        </span>
        {isCorp && unitsInList.length > 1 && (
          <select aria-label="Unidad" value={unitF} onChange={(e) => setUnitF(e.target.value)}>
            <option value="">Todas las unidades</option>
            {unitsInList.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        )}
      </FilterBar>
      {items === null ? (
        <p className="empty">Cargando...</p>
      ) : shown.length === 0 ? (
        <Card>{all.length === 0 ? <p className="empty">No hay consultas.</p> : <NoResults onClear={clear} />}</Card>
      ) : (
        shown.map((i) => (
          <Card key={i.id}>
            <h3>
              <Highlight text={i.subject} query={q} />{" "}
              {i.status === "answered" ? <Pill variant="good">Respondida</Pill> : <Pill variant="warn">Pendiente</Pill>}
            </h3>
            <p className="inq-meta">
              <strong>{i.unitSigla ?? i.unitName}</strong> · <Highlight text={i.authorName} query={q} /> · {fmt(i.createdAt)}
            </p>
            <p style={{ whiteSpace: "pre-wrap" }}><Highlight text={i.body} query={q} /></p>
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
