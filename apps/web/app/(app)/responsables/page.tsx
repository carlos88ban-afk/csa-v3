"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card } from "@/components/ui";
import { useMe } from "@/lib/use-me";

interface Block {
  subindicatorId: string;
  dimension: string;
  indicator: string | null;
  title: string;
  userId: string | null;
  userName: string | null;
}
interface UserRow { userId: string; name: string; email?: string; unitId: string | null }

export default function ResponsablesPage() {
  const { me, loading } = useMe();
  const [evalId, setEvalId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = (id: string) => api.get<{ blocks: Block[] }>(`/api/evaluations/${id}/blocks`).then((r) => setBlocks(r.blocks));
  useEffect(() => {
    if (!me || me.appRole !== "unit_admin") return;
    api.get<{ evaluation: { id: string } | null }>("/api/current-evaluation").then((r) => {
      if (!r.evaluation) return setBlocks([]);
      setEvalId(r.evaluation.id);
      void load(r.evaluation.id);
    });
    api.get<{ users: UserRow[] }>("/api/users").then((r) => setUsers(r.users));
  }, [me]);

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

  return (
    <main className="page">
      <h1>Responsables de {me.unitName}</h1>
      <p className="page__lead">
        Elige quién responde cada bloque. Un evaluador solo ve y edita los bloques que tiene asignados.
      </p>
      {error && <p className="alert" role="alert">{error}</p>}
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
                    <select value={b.userId ?? ""} onChange={(e) => void assign(b.subindicatorId, e.target.value)}>
                      <option value="">Sin asignar</option>
                      {users.map((u) => (
                        <option key={u.userId} value={u.userId}>{u.email && users.filter((x) => x.name === u.name).length > 1 ? `${u.name} (${u.email})` : u.name}</option>
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
