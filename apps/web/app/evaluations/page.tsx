"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { Card, Pill } from "@/components/ui";
import { useMe } from "@/lib/use-me";
import { formatDueDate } from "@/lib/due-date";

interface Current {
  id: string;
  frameworkId: string;
  title: string;
  dueDate: string | null;
  publishedAt: string;
}
interface Row {
  unitId: string;
  unitName: string;
  unitSigla: string | null;
  subindicatorId: string;
  dimension: string;
  indicator: string | null;
  title: string;
  responsibleId: string | null;
  responsible: string | null;
  total: number;
  answered: number;
  completed: number;
  approved: number;
  submitted: number;
  returned: number;
  updatedBy: string | null;
  updatedAt: string | null;
}

function stateOf(r: Row): string {
  if (r.total > 0 && r.submitted === r.total) return "Entregada";
  if (r.total > 0 && r.approved === r.total) return "Aprobada";
  if (r.returned > 0) return "Devuelta";
  if (r.total > 0 && r.completed === r.total) return "Lista para revisar";
  if (r.answered > 0) return "En progreso";
  return "Sin iniciar";
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Inicio del administrador corporativo: la evaluación vigente, el avance por
// unidad y por bloque, con filtros y trazabilidad.
export default function EvaluationsPage() {
  const { me, loading } = useMe();
  const [current, setCurrent] = useState<Current | null | undefined>(undefined);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [f, setF] = useState({ unit: "", dimension: "", responsible: "", state: "" });

  useEffect(() => {
    if (me?.appRole !== "corporate_admin") return;
    api.get<{ evaluation: Current | null }>("/api/current-evaluation").then(async (r) => {
      setCurrent(r.evaluation);
      if (r.evaluation) setRows((await api.get<{ rows: Row[] }>(`/api/evaluations/${r.evaluation.id}/overview`)).rows);
    });
  }, [me]);

  const units = useMemo(() => {
    const m = new Map<string, { name: string; total: number; answered: number }>();
    for (const r of rows ?? []) {
      const u = m.get(r.unitId) ?? { name: r.unitSigla || r.unitName, total: 0, answered: 0 };
      u.total += r.total;
      u.answered += r.answered;
      m.set(r.unitId, u);
    }
    return m;
  }, [rows]);

  if (loading || !me) return <main className="loading">Cargando...</main>;
  if (me.appRole !== "corporate_admin") return <main className="page">Esta sección es para el administrador corporativo.</main>;
  if (current === undefined) return <main className="loading">Cargando...</main>;
  if (current === null)
    return (
      <main className="page">
        <h1>Evaluación</h1>
        <p className="page__lead">
          Aún no hay una evaluación vigente. Ve a <a href="/frameworks">Estructura</a>, arma o duplica la del año y pulsa <strong>Publicar</strong>.
        </p>
      </main>
    );

  const closed = !!current.dueDate && new Date(current.dueDate) <= new Date();
  const all = rows ?? [];
  const dims = [...new Set(all.map((r) => r.dimension))];
  const responsibles = [...new Set(all.map((r) => r.responsible).filter(Boolean) as string[])];
  const shown = all.filter(
    (r) =>
      (!f.unit || r.unitId === f.unit) &&
      (!f.dimension || r.dimension === f.dimension) &&
      (!f.responsible || (f.responsible === "__none" ? !r.responsible : r.responsible === f.responsible)) &&
      (!f.state || stateOf(r) === f.state),
  );

  return (
    <main className="page page--wide">
      <div className="page__head">
        <h1>{current.title}</h1>
        <span className="entry-list__actions">
          <a className="btn btn--secondary" href={`/frameworks/${current.frameworkId}/builder`}>Editar estructura</a>
          <a className="btn btn--secondary" href="/consolidado">Ver consolidado</a>
          <a className="btn btn--primary" href={`/api/evaluations/${current.id}/export-xlsx`}>Exportar Excel</a>
        </span>
      </div>
      <p className="page__lead">
        {closed ? <Pill variant="warn">Cerrada</Pill> : <Pill variant="good">Vigente</Pill>} Publicada el {formatDueDate(current.publishedAt)} ·{" "}
        {current.dueDate ? `Plazo: ${formatDueDate(current.dueDate)}` : "Sin plazo"}
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[...units].map(([id, u]) => {
          const pct = u.total === 0 ? 0 : Math.round((u.answered / u.total) * 100);
          return (
            <Card key={id}>
              <strong>{u.name}</strong>
              <div>{pct}% · {u.answered}/{u.total} preguntas</div>
            </Card>
          );
        })}
      </div>

      <p style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
        <select aria-label="Unidad" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>
          <option value="">Todas las unidades</option>
          {[...units].map(([id, u]) => <option key={id} value={id}>{u.name}</option>)}
        </select>
        <select aria-label="Dimensión" value={f.dimension} onChange={(e) => setF({ ...f, dimension: e.target.value })}>
          <option value="">Todas las dimensiones</option>
          {dims.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select aria-label="Responsable" value={f.responsible} onChange={(e) => setF({ ...f, responsible: e.target.value })}>
          <option value="">Todos los responsables</option>
          <option value="__none">Sin responsable</option>
          {responsibles.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select aria-label="Estado" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>
          <option value="">Todos los estados</option>
          {["Sin iniciar", "En progreso", "Devuelta", "Lista para revisar", "Aprobada", "Entregada"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </p>

      <Card>
        {rows === null ? (
          <p className="empty">Cargando avance...</p>
        ) : shown.length === 0 ? (
          <p className="empty">{all.length === 0 ? "Aún no hay unidades activas con bloques asignados." : "Ningún bloque coincide con los filtros."}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Unidad</th><th>Dimensión › Bloque</th><th>Responsable</th><th>Avance</th><th>Estado</th><th>Última edición</th><th></th></tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.unitId}-${r.subindicatorId}`}>
                  <td><strong>{r.unitSigla || r.unitName}</strong></td>
                  <td>{r.dimension}{r.indicator ? ` › ${r.indicator}` : ""} › {r.title}</td>
                  <td>{r.responsible ?? <em>Sin asignar</em>}</td>
                  <td>{r.answered}/{r.total}</td>
                  <td><Pill variant={stateOf(r) === "Entregada" ? "good" : stateOf(r) === "Devuelta" ? "warn" : "neutral"}>{stateOf(r)}</Pill></td>
                  <td>{r.updatedBy ? `${r.updatedBy} · ${r.updatedAt ? fmt(r.updatedAt) : ""}` : "—"}</td>
                  <td>
                    <a className="btn btn--secondary btn--sm" href={`/frameworks/${current.frameworkId}/evaluations/${current.id}/review?unit=${r.unitId}`}>
                      Revisar
                    </a>
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
