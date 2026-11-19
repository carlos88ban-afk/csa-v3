"use client";

import { useState } from "react";
import type { FormElement } from "@plataforma-csa/sdk-core";
import { api } from "@/lib/api-client";
import { useMe } from "@/components/me-provider";
import { PasswordReveal } from "@/components/password-reveal";

type Resp = { responsibleUserId?: string; responsibleEmail?: string };

// VS-080: responsable del corporativo de un tema, asignado desde el árbol. Solo aparece
// si el tema lo responde el corporativo (casilla «Corporativo» marcada).
export function CorporateResponsible({
  elements,
  onChange,
}: {
  elements: FormElement[];
  onChange: (patch: Resp | null) => void;
}) {
  const { me } = useMe();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const corp = me.corporateOrgId;
  const first = elements.find((el) => el.type !== "evidencia");
  if (!corp || me.appRole !== "corporate_admin" || !first?.appliesTo?.includes(corp)) return null;
  const current = first as FormElement & Resp;

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ userId: string; email: string; created: boolean; password?: string }>("/api/corporate-responsible", { email });
      onChange({ responsibleUserId: r.userId, responsibleEmail: r.email });
      if (r.password) setCreated({ email: r.email, password: r.password });
      setEmail("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg === "EMAIL_IN_OTHER_UNIT" ? "Ese correo ya pertenece a una unidad." : msg === "EMAIL_REQUIRED" ? "Escribe un correo válido." : "No se pudo asignar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="corp-resp">
      {created && <PasswordReveal email={created.email} password={created.password} onClose={() => setCreated(null)} />}
      {current.responsibleEmail ? (
        <span className="corp-resp__current">
          Responsable: <strong>{current.responsibleEmail}</strong>{" "}
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => onChange(null)}>Quitar</button>
        </span>
      ) : (
        <form className="corp-resp__form" onSubmit={assign}>
          <input type="email" required placeholder="Correo del responsable del corporativo" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Correo del responsable" />
          <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>Asignar</button>
        </form>
      )}
      {error && <span className="alert" role="alert">{error}</span>}
    </div>
  );
}
