"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useNewAnswers } from "@/lib/use-new-answers";

// Botón flotante «¿Dudas o sugerencias?». Si hay un tema abierto, el mensaje
// arranca con «Tengo una duda sobre el tema: …»; el usuario lo puede completar o borrar
// (sugerencia o consulta general). Se guarda como consulta (/consultas) y no forma parte de la evaluación.
export function InquiryFab({ topic }: { topic: string }) {
  const prefill = `Tengo una duda sobre el tema: ${topic}. `;
  const newAnswers = useNewAnswers();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(prefill);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si el usuario cambia de tema y aún no editó el mensaje, se actualiza la sugerencia.
  useEffect(() => {
    if (!touched) setText(prefill);
  }, [prefill, touched]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      const subject = body.includes(topic) ? `Tema ${topic}`.slice(0, 200) : "Consulta general";
      await api.post("/api/inquiries", { subject, body });
      setSent(true);
      setTouched(false);
      setText(prefill);
    } catch {
      setError("No se pudo enviar. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inq-fab">
      {open && (
        <form className="inq-fab__panel" onSubmit={send} aria-label="Dudas o sugerencias">
          {newAnswers > 0 && (
            <p className="alert alert--ok" role="status">
              <strong>Tienes {newAnswers === 1 ? "una respuesta nueva" : `${newAnswers} respuestas nuevas`}.</strong> <Link href="/consultas">Verla en Mis consultas</Link>
            </p>
          )}
          <strong>¿Tienes dudas o sugerencias?</strong>
          <p className="inq-fab__hint">Cuéntanos sobre qué indicador es tu duda, o escribe una sugerencia o consulta general. Puedes borrar el texto sugerido.</p>
          <textarea
            value={text}
            rows={4}
            onChange={(e) => {
              setText(e.target.value);
              setTouched(true);
              setSent(false);
            }}
            aria-label="Tu mensaje"
          />
          {error && <p className="alert" role="alert">{error}</p>}
          {sent && (
            <p className="alert alert--ok" role="status">
              Enviado. Verás la respuesta en <Link href="/consultas">Mis consultas</Link>.
            </p>
          )}
          <div className="inq-fab__actions">
            <Link href="/consultas">Ver mis consultas</Link>
            <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !text.trim()}>
              {busy ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </form>
      )}
      <button type="button" className="inq-fab__btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">💬</span> {open ? "Cerrar" : newAnswers > 0 ? "Tienes una respuesta nueva" : "¿Dudas o sugerencias?"}
        {!open && newAnswers > 0 && <span className="nav-badge">{newAnswers}</span>}
      </button>
    </div>
  );
}
