"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api-client";
import { PasswordReveal } from "@/components/password-reveal";

// Asignar responsables desde el propio árbol de la evaluación (admin de unidad):
// cada dimensión, indicador o bloque muestra quién responde y permite cambiarlo ahí mismo.

export interface AssignBlock {
  subindicatorId: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
}
interface UnitUser { userId: string; name: string; email: string }

export interface AssignData {
  evaluationId: string;
  blocks: Map<string, AssignBlock>;
  users: UnitUser[];
  reload: () => Promise<void>;
}

export function useAssignData(evaluationId: string | undefined, enabled: boolean): AssignData | null {
  const [blocks, setBlocks] = useState<Map<string, AssignBlock>>(new Map());
  const [users, setUsers] = useState<UnitUser[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (!evaluationId) return;
    const [b, u] = await Promise.all([
      api.get<{ blocks: AssignBlock[] }>(`/api/evaluations/${evaluationId}/blocks`),
      api.get<{ users: UnitUser[] }>("/api/users"),
    ]);
    setBlocks(new Map(b.blocks.map((x) => [x.subindicatorId, x])));
    setUsers(u.users);
    setReady(true);
  }, [evaluationId]);

  useEffect(() => {
    if (enabled) void reload().catch(() => setReady(false));
  }, [enabled, reload]);

  return enabled && ready && evaluationId ? { evaluationId, blocks, users, reload } : null;
}

const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;

export function AssignNode({ data, scopeIds, label, children }: { data: AssignData | null; scopeIds: string[]; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  if (!data || scopeIds.length === 0) return <>{children}</>;

  const inScope = scopeIds.map((id) => data.blocks.get(id)).filter((b): b is AssignBlock => !!b);
  if (inScope.length === 0) return <>{children}</>;
  const people = new Map<string, { name: string; email: string; count: number }>();
  for (const b of inScope) {
    if (!b.userId) continue;
    const p = people.get(b.userId) ?? { name: b.userName ?? b.userEmail ?? "", email: b.userEmail ?? "", count: 0 };
    p.count++;
    people.set(b.userId, p);
  }
  const unassigned = inScope.filter((b) => !b.userId).length;
  const list = [...people.entries()];
  const summary = list.length === 0 ? "＋ Asignar" : list.length === 1 && unassigned === 0 ? firstName(list[0]![1].name) : `${list.length} personas`;
  const known = data.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase());

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const r = await api.put<{ email: string; password?: string }>(`/api/evaluations/${data.evaluationId}/blocks`, { email, name, subindicatorIds: scopeIds });
      if (r.password) setCreated({ email: r.email, password: r.password });
      setEmail("");
      setName("");
      await data.reload();
    } catch (err) {
      const m = err instanceof Error ? err.message : "";
      setError(m === "EMAIL_IN_OTHER_UNIT" ? "Ese correo pertenece a otra unidad." : "No se pudo asignar.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: string) {
    if (!data) return;
    setBusy(true);
    try {
      for (const b of inScope) {
        if (b.userId === userId) await api.put(`/api/evaluations/${data.evaluationId}/blocks`, { subindicatorId: b.subindicatorId, userId: null });
      }
      await data.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="assign-node">
      <div className="runtime-nav__row">
        {children}
        <button
          type="button"
          className={`assign-chip${list.length === 0 ? " assign-chip--empty" : ""}${open ? " assign-chip--open" : ""}`}
          aria-expanded={open}
          aria-label={`Responsable de ${label}: ${summary}`}
          title={list.length ? list.map(([, p]) => p.name).join(", ") : "Sin responsable"}
          onClick={() => setOpen((o) => !o)}
        >
          {summary}
        </button>
      </div>
      {open && (
        <div className="assign-panel">
          {list.map(([id, p]) => (
            <div key={id} className="assign-panel__person">
              <span><strong>{p.name}</strong><small>{p.email} · {p.count} {p.count === 1 ? "bloque" : "bloques"}</small></span>
              <button type="button" className="assign-panel__x" disabled={busy} aria-label={`Quitar a ${p.name}`} onClick={() => void remove(id)}>✕</button>
            </div>
          ))}
          {unassigned > 0 && list.length > 0 && <p className="assign-panel__note">{unassigned} {unassigned === 1 ? "bloque sin responsable" : "bloques sin responsable"}</p>}
          <form onSubmit={assign} className="assign-panel__form">
            <input type="email" required list={`assign-users-${scopeIds[0]}`} placeholder="correo@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Correo del responsable" />
            <datalist id={`assign-users-${scopeIds[0]}`}>{data.users.map((u) => <option key={u.userId} value={u.email}>{u.name}</option>)}</datalist>
            {email.includes("@") && !known && <input placeholder="Nombre (cuenta nueva)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre" />}
            <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>Asignar</button>
          </form>
          {error && <p className="assign-panel__err" role="alert">{error}</p>}
          {created && <PasswordReveal email={created.email} password={created.password} onClose={() => setCreated(null)} />}
        </div>
      )}
    </div>
  );
}
