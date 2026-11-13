"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { Button, Card } from "@/components/ui";
import { PasswordReveal } from "@/components/password-reveal";
import { useMe } from "@/lib/use-me";

interface Block {
  subindicatorId: string;
  dimension: string;
  indicator: string | null;
  title: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
}
interface UserRow { userId: string; name: string; email: string; unitId: string | null }

const ERRORS: Record<string, string> = {
  EMAIL_IN_OTHER_UNIT: "Ese correo ya pertenece a otra unidad.",
  EMAIL_REQUIRED: "Escribe un correo válido.",
  NO_BLOCKS: "Elige qué preguntas asignar.",
};

export default function ResponsablesPage() {
  const { me, loading } = useMe();
  const [evalId, setEvalId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [form, setForm] = useState({ email: "", name: "", scope: "" });

  const load = (id: string) => api.get<{ blocks: Block[] }>(`/api/evaluations/${id}/blocks`).then((r) => setBlocks(r.blocks));
  const loadUsers = () => api.get<{ users: UserRow[] }>("/api/users").then((r) => setUsers(r.users));
  useEffect(() => {
    if (!me || me.appRole !== "unit_admin") return;
    api.get<{ evaluation: { id: string } | null }>("/api/current-evaluation").then((r) => {
      if (!r.evaluation) return setBlocks([]);
      setEvalId(r.evaluation.id);
      void load(r.evaluation.id);
    });
    void loadUsers();
  }, [me]);

  // Alcances posibles: dimensión completa, indicador completo o un bloque.
  const scopes = useMemo(() => {
    const list: { key: string; label: string; ids: string[] }[] = [];
    const dims = [...new Set((blocks ?? []).map((b) => b.dimension))];
    for (const d of dims) {
      const inDim = (blocks ?? []).filter((b) => b.dimension === d);
      list.push({ key: `d:${d}`, label: `Toda la dimensión · ${d}`, ids: inDim.map((b) => b.subindicatorId) });
      const inds = [...new Set(inDim.map((b) => b.indicator).filter(Boolean) as string[])];
      for (const i of inds) {
        const inInd = inDim.filter((b) => b.indicator === i);
        list.push({ key: `i:${d}|${i}`, label: `   Indicador · ${i}`, ids: inInd.map((b) => b.subindicatorId) });
      }
      for (const b of inDim) list.push({ key: `b:${b.subindicatorId}`, label: `      Bloque · ${b.title}`, ids: [b.subindicatorId] });
    }
    return list;
  }, [blocks]);

  async function assignEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!evalId) return;
    setError(null);
    setOk(null);
    setCreated(null);
    const scope = scopes.find((s) => s.key === form.scope);
    if (!scope) return setError(ERRORS.NO_BLOCKS!);
    try {
      const r = await api.put<{ email: string; created: boolean; assigned: number; password?: string }>(`/api/evaluations/${evalId}/blocks`, {
        email: form.email,
        name: form.name,
        subindicatorIds: scope.ids,
      });
      setOk(`${r.email} quedó como responsable de ${r.assigned} ${r.assigned === 1 ? "bloque" : "bloques"}.`);
      if (r.password) setCreated({ email: r.email, password: r.password });
      setForm({ ...form, email: "", name: "" });
      await load(evalId);
      await loadUsers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(ERRORS[msg] ?? "No se pudo guardar la asignación.");
    }
  }

  async function assign(subindicatorId: string, userId: string) {
    if (!evalId) return;
    setError(null);
    try {
      await api.put(`/api/evaluations/${evalId}/blocks`, { subindicatorId, userId: userId || null });
      await load(evalId);
    } catch {
      setError("No se pudo guardar la asignación.");
    }
  }

  if (loading || !me) return <main className="loading">Cargando...</main>;
  if (me.appRole !== "unit_admin") return <main className="page">Solo el administrador de la unidad asigna responsables.</main>;

  const known = users.some((u) => u.email.toLowerCase() === form.email.trim().toLowerCase());

  return (
    <main className="page">
      <h1>Responsables de {me.unitName}</h1>
      <p className="page__lead">
        Asigna con un correo quién responde cada tema. Esa persona entra con el mismo enlace y ve solo las preguntas que le tocan.
      </p>
      {error && <p className="alert" role="alert">{error}</p>}
      {ok && <p className="alert" role="status">{ok}</p>}
      {created && <PasswordReveal email={created.email} password={created.password} onClose={() => setCreated(null)} />}
      <Card>
        <form onSubmit={assignEmail} className="field-grid">
          <label className="field">
            <span className="field__label">Correo del responsable</span>
            <input type="email" list="resp-users" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <datalist id="resp-users">{users.map((u) => <option key={u.userId} value={u.email}>{u.name}</option>)}</datalist>
          </label>
          {form.email.includes("@") && !known && (
            <label className="field">
              <span className="field__label">Nombre (cuenta nueva)</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Opcional" />
            </label>
          )}
          <label className="field">
            <span className="field__label">Qué le asignas</span>
            <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} required>
              <option value="">Elegir dimensión, indicador o bloque…</option>
              {scopes.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <div><Button type="submit" variant="primary">Asignar</Button></div>
        </form>
        {form.email.includes("@") && !known && (
          <p className="page__lead">Este correo aún no tiene cuenta: se creará como evaluador de tu unidad y te mostraré su contraseña para que la copies.</p>
        )}
      </Card>
      <Card>
        {blocks === null ? (
          <p className="empty">Cargando...</p>
        ) : blocks.length === 0 ? (
          <p className="empty">No hay una evaluación vigente con bloques para tu unidad.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Dimensión</th><th>Indicador</th><th>Bloque</th><th>Responsable</th></tr></thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.subindicatorId}>
                  <td>{b.dimension}</td>
                  <td>{b.indicator ?? "—"}</td>
                  <td>{b.title}</td>
                  <td>
                    <select value={b.userId ?? ""} aria-label={`Responsable de ${b.title}`} onChange={(e) => void assign(b.subindicatorId, e.target.value)}>
                      <option value="">Sin asignar</option>
                      {users.map((u) => (
                        <option key={u.userId} value={u.userId}>{u.name} ({u.email})</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </main>
  );
}
