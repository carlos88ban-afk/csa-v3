"use client";

// VS-081 (docs/slices/VS-081.md): «Revisar avances» — la pantalla del evaluado en solo lectura,
// consolidada o por unidad, con barras de progreso, búsqueda, filtros y observaciones.
import type { Evaluation, EvaluationSnapshot, ResponseAnswers } from "@plataforma-csa/sdk-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { RuntimeCore, type ReviewProps, type RuntimeAdapter } from "@/app/(app)/evaluations/[token]/page";
import { buildReviewView, viewProgress, CONSOLIDATED, type ReviewRow, type ReviewUnit } from "@/lib/review-view";

interface Data {
  title: string;
  corporateOrgId: string;
  dueDate: string | null;
  snapshot: EvaluationSnapshot;
  units: Array<{ id: string; name: string; sigla: string | null }>;
  responses: Array<{ unitId: string; subindicatorId: string; answers: ResponseAnswers }>;
}

export default function RevisarPage() {
  const { me, loading } = useMe();
  const [evalId, setEvalId] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [empty, setEmpty] = useState(false);
  const [viewId, setViewId] = useState(CONSOLIDATED);

  const load = useCallback(async (id: string) => setData(await api.get<Data>(`/api/evaluations/${id}/consolidated`)), []);
  useEffect(() => {
    if (me?.appRole !== "corporate_admin") return;
    api.get<{ evaluation: { id: string } | null }>("/api/current-evaluation").then(async (r) => {
      if (!r.evaluation) return setEmpty(true);
      setEvalId(r.evaluation.id);
      await load(r.evaluation.id);
    });
  }, [me, load]);

  const { evaluation, units, rows } = useMemo(() => {
    if (!data) return { evaluation: null, units: [] as ReviewUnit[], rows: [] as ReviewRow[] };
    const ev = { id: evalId ?? "", title: data.title, dueDate: data.dueDate, snapshot: data.snapshot } as unknown as Evaluation;
    const list: ReviewUnit[] = data.units.map((u) => ({ id: u.id, name: u.name, sigla: u.sigla }));
    // El corporativo aparece como una vista más solo si tiene temas propios.
    const corp: ReviewUnit = { id: data.corporateOrgId, name: "Corporativo", sigla: "Corporativo", isCorporate: true };
    const hasCorp = data.snapshot.dimensions.some((d) =>
      [...d.indicators.flatMap((i) => i.subindicators), ...d.subindicators].some((s) => (s.formSchema?.elements ?? []).some((e) => e.appliesTo?.includes(corp.id))),
    );
    return { evaluation: ev, units: hasCorp ? [...list, corp] : list, rows: data.responses as ReviewRow[] };
  }, [data, evalId]);

  const views = useMemo(() => {
    if (!evaluation) return null;
    const out = new Map<string, ReturnType<typeof buildReviewView>>();
    for (const id of [CONSOLIDATED, ...units.map((u) => u.id)]) out.set(id, buildReviewView(evaluation, units, rows, id));
    return out;
  }, [evaluation, units, rows]);

  const current = views?.get(viewId) ?? views?.get(CONSOLIDATED) ?? null;
  const currentRef = useRef(current);
  currentRef.current = current;
  const adapter = useMemo<RuntimeAdapter>(
    () => ({
      fetchEvaluation: () => Promise.resolve(currentRef.current!.evaluation),
      fetchResponses: () => Promise.resolve([]),
      saveResponse: () => Promise.resolve(),
    }),
    [],
  );

  const observe = useCallback(
    async (subindicatorId: string, text: string | null) => {
      if (!evalId || viewId === CONSOLIDATED) return;
      await api.put(`/api/evaluations/${evalId}/observations`, { unitId: viewId, subindicatorId, text });
      await load(evalId);
    },
    [evalId, viewId, load],
  );

  if (loading || !me) return <main className="loading">Cargando...</main>;
  if (me.appRole !== "corporate_admin") return <main className="page">Solo el administrador corporativo revisa avances.</main>;
  if (empty) return <main className="page"><h1>Revisar avances</h1><p className="page__lead">No hay una evaluación vigente.</p></main>;
  if (!current || !views) return <main className="loading">Cargando...</main>;

  const review: ReviewProps = { evaluation: current.evaluation, answers: current.answers, unitId: viewId === CONSOLIDATED ? null : viewId, observe };
  const tabs = [{ id: CONSOLIDATED, label: "Consolidado" }, ...units.map((u) => ({ id: u.id, label: u.sigla || u.name }))];

  return (
    <>
      <div className="review-bar">
        <div className="review-bar__tabs" role="tablist" aria-label="Vista">
          {tabs.map((t) => {
            const p = viewProgress(views.get(t.id)!);
            const pct = p.pct;
            return (
              <button key={t.id} type="button" role="tab" aria-selected={viewId === t.id} className={`review-tab${viewId === t.id ? " review-tab--on" : ""}`} onClick={() => setViewId(t.id)}>
                <span>{t.id === CONSOLIDATED ? "Avance " : "Avance "}{t.label}</span>
                <span className="review-tab__bar"><i style={{ width: `${pct}%` }} /></span>
                <small>{pct}% de avance · {p.complete}/{p.total} temas completos</small>
              </button>
            );
          })}
        </div>
        <span className="review-bar__side">
          <span className="review-bar__ro">Solo lectura</span>
          {evalId && <a className="btn btn--secondary btn--sm" href={`/api/evaluations/${evalId}/export-xlsx`}>Descargar Excel</a>}
        </span>
      </div>
      <RuntimeCore adapter={adapter} evidenceToken={undefined} review={review} />
    </>
  );
}
