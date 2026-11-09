"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useCachedGet } from "@/lib/api-cache";
import { Button, Card, Pill } from "@/components/ui";
import { PasswordReveal } from "@/components/password-reveal";
import { ROLE_LABEL, useMe, type Me } from "@/lib/use-me";

interface UserRow {
  userId: string;
  name: string;
  email: string;
  appRole: Me["appRole"];
  unitId: string | null;
  unitName: string | null;
  unitSigla: string | null;
}
interface Unit {
  id: string;
  name: string;
  sigla: string | null;
  active: boolean;
}

export default function UsersPage() {
  const { me, loading } = useMe();
  const { data: usersData, reload } = useCachedGet<{ users: UserRow[] }>(me.appRole === "evaluator" ? null : "/api/users");
  const { data: unitsData } = useCachedGet<{ units: Unit[] }>(me.appRole === "evaluator" ? null : "/api/units");
  const users = usersData?.users ?? null;
  const units = (unitsData?.units ?? []).filter((u) => u.active);
  const [form, setForm] = useState({ name: "", email: "", role: "evaluator" as Me["appRole"], unitId: "" });
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = reload;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);
    try {
      const res = await api.post<{ email: string; initialPassword: string }>("/api/users", {
        name: form.name,
        email: form.email,
        role: form.role,
        unitId: form.role === "corporate_admin" ? null : me?.appRole === "unit_admin" ? me.unitId : form.unitId,
      });
      setCreated({ email: res.email, password: res.initialPassword });
      setForm({ ...form, name: "", email: "" });
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg === "EMAIL_ALREADY_USED" ? "Ya existe una cuenta con ese correo." : msg === "UNIT_REQUIRED" ? "Elige una unidad." : "No se pudo crear el usuario.");
    }
  }

  async function resetPassword(id: string) {
    setError(null);
    try {
      const res = await api.post<{ email: string; password: string }>(`/api/users/${id}/password`, {});
      setCreated({ email: res.email, password: res.password });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("No se pudo generar la contraseña.");
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await api.del(`/api/users/${id}`);
      setConfirm(null);
      await load();
    } catch {
      setError("No se pudo eliminar el usuario.");
    }
  }

  if (me.appRole === "evaluator") return <main className="page">No tienes acceso a esta sección.</main>;
  const isCorp = me.appRole === "corporate_admin";

  return (
    <main className="page">
      <h1>Usuarios</h1>
      <p className="page__lead">
        {isCorp
          ? "Cada usuario pertenece a una sola unidad. Los administradores corporativos ven todo."
          : `Usuarios de ${me.unitName ?? "tu unidad"}. Solo puedes crear usuarios de tu unidad.`}
      </p>
      {error && <p className="alert" role="alert">{error}</p>}
      {created && <PasswordReveal email={created.email} password={created.password} onClose={() => setCreated(null)} />}
      <Card>
        <form onSubmit={create} className="field-grid">
          <label className="field">
            <span className="field__label">Nombre</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="field">
            <span className="field__label">Correo</span>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label className="field">
            <span className="field__label">Rol</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Me["appRole"] })}>
              <option value="evaluator">{ROLE_LABEL.evaluator}</option>
              <option value="unit_admin">{ROLE_LABEL.unit_admin}</option>
              {isCorp && <option value="corporate_admin">{ROLE_LABEL.corporate_admin}</option>}
            </select>
          </label>
          {isCorp && form.role !== "corporate_admin" && (
            <label className="field">
              <span className="field__label">Unidad</span>
              <select value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })} required>
                <option value="">Elegir…</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.sigla ? `${u.sigla} — ${u.name}` : u.name}</option>
                ))}
              </select>
            </label>
          )}
          <div><Button type="submit" variant="primary">Crear usuario</Button></div>
        </form>
      </Card>
      <Card>
        {users === null ? (
          <p className="empty">Cargando...</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Unidad</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userId}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td><Pill>{ROLE_LABEL[u.appRole]}</Pill></td>
                  <td>{u.unitName ? `${u.unitSigla ?? ""} ${u.unitName}`.trim() : "Corporativo"}</td>
                  <td>
                    {u.userId !== me.userId &&
                      (confirm === u.userId ? (
                        <>
                          <Button size="sm" variant="danger" onClick={() => void remove(u.userId)}>Sí, eliminar</Button>{" "}
                          <Button size="sm" onClick={() => setConfirm(null)}>Cancelar</Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" onClick={() => void resetPassword(u.userId)}>Nueva contraseña</Button>{" "}
                          <Button size="sm" onClick={() => setConfirm(u.userId)}>Eliminar</Button>
                        </>
                      ))}
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
