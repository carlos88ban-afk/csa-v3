"use client";

import { useEffect, useState } from "react";

// Enlace que el administrador comparte con las unidades de negocio: entran con su
// cuenta y llegan directo a su evaluación. Visible y con un clic para copiar.
export function ShareLink({ title, closed }: { title: string; closed: boolean }) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { setUrl(`${window.location.origin}/login?next=/mi-evaluacion`); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.getElementById("share-link-input") as HTMLInputElement | null;
      el?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <section className="share" aria-label="Enlace de la evaluación vigente">
      <div className="share__head">
        <span className={`share__badge${closed ? " share__badge--closed" : ""}`}>{closed ? "Evaluación cerrada" : "Evaluación vigente"}</span>
        <strong>{title}</strong>
      </div>
      <p className="share__hint">
        Comparte este enlace con las unidades de negocio. Cada una inicia sesión con su cuenta y ve solo lo que le toca responder.
      </p>
      <div className="share__row">
        <input id="share-link-input" className="share__input" readOnly value={url} aria-label="Enlace para las unidades" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn btn--primary" onClick={() => void copy()}>{copied ? "✓ Enlace copiado" : "Copiar enlace"}</button>
      </div>
    </section>
  );
}
