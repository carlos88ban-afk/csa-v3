"use client";

import { useEffect, useMemo, useState } from "react";
import { splitAnswerText, type EvaluationSnapshot, type ResponseAnswers } from "@plataforma-csa/sdk-core";
import { api } from "@/lib/api-client";
import { Card } from "@/components/ui";
import { useMe } from "@/lib/use-me";
import { buildConsolidation, type UnitRef } from "@/lib/consolidation";

interface Data {
  title: string;
  snapshot: EvaluationSnapshot;
  units: UnitRef[];
  responses: Array<{ unitId: string; subindicatorId: string; answers: ResponseAnswers }>;
}

// Un aporte "SIGLA: texto (Tabla: …)" → etiqueta de unidad + frase + tablas reales.
function Contribution({ line }: { line: string }) {
  const idx = line.indexOf(": ");
  const unit = idx > 0 ? line.slice(0, idx) : "";
  const parts = splitAnswerText(idx > 0 ? line.slice(idx + 2) : line);
  return (
    <div className="consol-contrib">
      {unit && <span className="consol-contrib__unit">{unit}</span>}
      {parts.lead && <p className="consol-contrib__lead">{parts.lead}</p>}
      {parts.tables.map((t, ti) => (
        <table key={ti} className="consol-subtable">
          {parts.tables.length > 1 && <caption>{t.title}</caption>}
          <thead>
            <tr><th />{t.headers.map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {t.rows.map((r, ri) => (
              <tr key={ri}>
                <th scope="row">{r.label}</th>
                {t.headers.map((h) => <td key={h}>{r.cells[h] ?? ""}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

export default function ConsolidadoPage() {
  const { me, loading } = useMe();
  const [evalId, setEvalId] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [empty, setEmpty] = useState(false);
  const [dim, setDim] = useState("");
  const [onlyAnswered, setOnlyAnswered] = useState(true);

  useEffect(() => {
    if (me?.appRole !== "corporate_admin") return;
    api.get<{ evaluation: { id: string } | null }>("/api/current-evaluation").then(async (r) => {
      if (!r.evaluation) return setEmpty(true);
      setEvalId(r.evaluation.id);
      setData(await api.get<Data>(`/api/evaluations/${r.evaluation.id}/consolidated`));
    });
  }, [me]);

  const rows = useMemo(() => (data ? buildConsolidation(data.snapshot, data.units, data.responses) : []), [data]);
  const dims = [...new Set(rows.map((r) => r.dimension))];
  const shown = rows.filter((r) => (!dim || r.dimension === dim) && (!onlyAnswered || r.answeredUnits > 0));

  if (loading || !me) return <main className="loading">Cargando...</main>;
  if (me.appRole !== "corporate_admin") return <main className="page">Solo el administrador corporativo ve el consolidado.</main>;
  if (empty) return <main className="page"><h1>Consolidado</h1><p className="page__lead">No hay una evaluación vigente.</p></main>;

  return (
    <main className="page page--wide">
      <div className="page__head">
        <h1>Consolidado{data ? ` — ${data.title}` : ""}</h1>
        {evalId && (
          <a className="btn btn--primary" href={`/api/evaluations/${evalId}/export-xlsx`}>
            Descargar Excel (.xlsx)
          </a>
        )}
      </div>
      <p className="page__lead">
        Se calcula automáticamente desde las respuestas de cada unidad: números se suman, Sí/No es Sí si alguna unidad responde Sí, y los textos, evidencias y enlaces se reúnen indicando la unidad.
      </p>
      <p>
        <label>
          Dimensión:{" "}
          <select value={dim} onChange={(e) => setDim(e.target.value)}>
            <option value="">Todas</option>
            {dims.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>{" "}
        <label>
          <input type="checkbox" checked={onlyAnswered} onChange={(e) => setOnlyAnswered(e.target.checked)} /> Solo preguntas con respuestas
        </label>
      </p>
      <Card>
        {!data ? (
          <p className="empty">Cargando...</p>
        ) : shown.length === 0 ? (
          <p className="empty">Aún no hay respuestas para consolidar.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Bloque</th><th>Pregunta</th><th>Unidades</th><th>Regla</th><th>Consolidado</th><th>Aportes por unidad</th></tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i}>
                  <td>{r.dimension} › {r.block}</td>
                  <td>{r.question}</td>
                  <td>{r.answeredUnits}/{r.applicableUnits}</td>
                  <td>{r.rule}</td>
                  <td style={{ whiteSpace: "pre-wrap" }}><strong>{r.value}</strong></td>
                  <td>{r.type === "texto_corto" || r.type === "texto_largo" || r.type === "fecha" || r.type === "evidencia" || r.type === "url_publica" ? "" : r.contributions.split("\n").filter(Boolean).map((l, li) => <Contribution key={li} line={l} />)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </main>
  );
}
