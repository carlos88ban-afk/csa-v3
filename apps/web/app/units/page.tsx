"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Button, Card, Pill } from "@/components/ui";
import { useMe } from "@/lib/use-me";

interface Unit {
  id: string;
  name: string;
  sigla: string | null;
  active: boolean;
}

export default function UnitsPage() {
  const { me, loading } = useMe();
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [name, setName] = useState("");
  const [sigla, setSigla] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", sigla: "" });
  const [error, setError] = useState<string | null>(null);

  const load = () => api.get<{ units: Unit[] }>("/api/units").then((r) => setUnits(r.units));
  useEffect(() => {
    if (me?.appRole === "corporate_admin") void load();
  }, [me]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/api/units", { name, sigla });
      setName("");
      setSigla("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la unidad");
    }
  }

  async function patch(id: string, data: Partial<Unit>) {
    setError(null);
    try {
      await api.patch(`/api/units/${id}`, data);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  if (loading || !me) return <main className="loading">Cargando...</main>;
  if (me.appRole !== "corporate_admin") return <main className="page">Solo el administrador corporativo gestiona unidades.</main>;

  return (
    <main className="page">
      <h1>Unidades de negocio</h1>
      <p className="page__lead">Cada unidad responde su parte de la evaluación. Desactivar una unidad le quita el acceso sin borrar sus respuestas.</p>
      {error && <p className="alert" role="alert">{error}</p>}
      <Card>
        <form onSubmit={create} className="field-grid">
          <label className="field">
            <span className="field__label">Siglas</span>
            <input value={sigla} onChange={(e) => setSigla(e.target.value)} placeholder="SPSA" maxLength={20} />
          </label>
          <label className="field">
            <span className="field__label">Nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Supermercados Peruanos" required />
          </label>
          <div>
            <Button type="submit" variant="primary">Crear unidad</Button>
          </div>
        </form>
      </Card>
      <Card>
        {units === null ? (
          <p className="empty">Cargando...</p>
        ) : units.length === 0 ? (
          <p className="empty">Aún no hay unidades. Crea la primera arriba.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Siglas</th><th>Nombre</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  {editing === u.id ? (
                    <>
                      <td><input value={draft.sigla} onChange={(e) => setDraft({ ...draft, sigla: e.target.value })} /></td>
                      <td><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></td>
                      <td></td>
                      <td>
                        <Button size="sm" variant="primary" onClick={() => void patch(u.id, draft)}>Guardar</Button>{" "}
                        <Button size="sm" onClick={() => setEditing(null)}>Cancelar</Button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td><strong>{u.sigla ?? "—"}</strong></td>
                      <td>{u.name}</td>
                      <td>{u.active ? <Pill variant="good">Activa</Pill> : <Pill variant="warn">Desactivada</Pill>}</td>
                      <td>
                        <Button size="sm" onClick={() => { setEditing(u.id); setDraft({ name: u.name, sigla: u.sigla ?? "" }); }}>Editar</Button>{" "}
                        <Button size="sm" onClick={() => void patch(u.id, { active: !u.active })}>
                          {u.active ? "Desactivar" : "Activar"}
                        </Button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </main>
  );
}
