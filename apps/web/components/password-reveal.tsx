"use client";

import { useState } from "react";

// Contraseña con ojo para mostrar/ocultar y botón de copiar.
export function PasswordReveal({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const [show, setShow] = useState(true);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShow(true);
    }
  }

  return (
    <div className="alert pw" role="status">
      <div>
        Contraseña nueva de <strong>{email}</strong>. Cópiala ahora: por seguridad no se guarda en claro y no se vuelve a mostrar.
        Si la olvidas, genera otra con «Nueva contraseña».
      </div>
      <div className="pw__row">
        <input className="pw__input" readOnly type={show ? "text" : "password"} value={password} aria-label="Contraseña" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => setShow((s) => !s)}>{show ? "🙈 Ocultar" : "👁 Mostrar"}</button>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => void copy()}>{copied ? "✓ Copiada" : "Copiar"}</button>
        <button type="button" className="btn btn--secondary btn--sm" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}
