"use client";

// VS-059 (docs/domain/business-units.md, "Filtrado de preguntas por
// unidad"): editor de exclusiones por Subindicador/elemento para una
// unidad de negocio asignada — el backend (setExclusion/removeExclusion/
// listExclusions) existe desde VS-050, este componente es la primera UI
// que lo usa. Excluir un Subindicador completo (checkbox de nivel
// Subindicador) es equivalente a excluir todos sus elementos de una vez
// (elementId: null) — ver spec "Tabla evaluation_assignment_exclusion".

import { useEffect, useState } from "react";
import { componentRegistry, type Evaluation, type EvaluationAssignmentExclusion, type EvaluationSnapshot, type FormElement } from "@plataforma-csa/sdk-core";
import { api } from "@/lib/api-client";
import { Pill } from "@/components/ui";

type QuestionComponentType = Extract<(typeof componentRegistry)[number], { isQuestion: true }>["type"];
const QUESTION_TYPES = new Set<QuestionComponentType>(
  componentRegistry.filter((c): c is Extract<(typeof componentRegistry)[number], { isQuestion: true }> => c.isQuestion).map((c) => c.type),
);
function isQuestion(el: FormElement): boolean {
  return QUESTION_TYPES.has(el.type as QuestionComponentType);
}

type SnapshotSubindicator = EvaluationSnapshot["dimensions"][number]["indicators"][number]["subindicators"][number];

function SubindicatorRow({
  sub,
  path,
  exclusions,
  busyKey,
  onToggleSub,
  onToggleElement,
}: {
  sub: SnapshotSubindicator;
  path: string;
  exclusions: EvaluationAssignmentExclusion[];
  busyKey: string | null;
  onToggleSub: (subindicatorId: string) => void;
  onToggleElement: (subindicatorId: string, elementId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const subExcluded = exclusions.some((e) => e.subindicatorId === sub.id && e.elementId === null);
  const questions = (sub.formSchema?.elements ?? []).filter(isQuestion);

  return (
    <li className="exclusion-editor__sub">
      <label className="field field--checkbox">
        <input
          type="checkbox"
          checked={subExcluded}
          disabled={busyKey === `${sub.id}::`}
          onChange={() => onToggleSub(sub.id)}
        />
        <span className="exclusion-editor__sub-title">
          {path} {sub.title}
        </span>
      </label>
      {questions.length > 0 && (
        <button type="button" className="exclusion-editor__expand" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "▾" : "▸"} {questions.length} pregunta{questions.length === 1 ? "" : "s"}
        </button>
      )}
      {expanded && questions.length > 0 && (
        <ul className="exclusion-editor__elements">
          {questions.map((el) => {
            const elExcluded = subExcluded || exclusions.some((e) => e.subindicatorId === sub.id && e.elementId === el.id);
            return (
              <li key={el.id}>
                <label className="field field--checkbox">
                  <input
                    type="checkbox"
                    checked={elExcluded}
                    disabled={subExcluded || busyKey === `${sub.id}::${el.id}`}
                    onChange={() => onToggleElement(sub.id, el.id)}
                  />
                  <span>{el.label || <em>(sin texto)</em>}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export function ExclusionEditor({ evaluationId, assignmentId }: { evaluationId: string; assignmentId: string }) {
  const [snapshot, setSnapshot] = useState<EvaluationSnapshot | null>(null);
  const [exclusions, setExclusions] = useState<EvaluationAssignmentExclusion[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // El snapshot COMPLETO (sin filtrar) de la Evaluación — la matriz
    // siempre ve el árbol entero para decidir qué excluir, a diferencia de
    // getEvaluationForBusinessUnit que ya viene filtrado.
    api
      .get<{ evaluation: Evaluation }>(`/api/evaluations/${evaluationId}`)
      .then((res) => setSnapshot(res.evaluation.snapshot))
      .catch(() => setError("No se pudo cargar la estructura de la evaluación"));
    api
      .get<{ exclusions: EvaluationAssignmentExclusion[] }>(`/api/evaluations/${evaluationId}/assignments/${assignmentId}/exclusions`)
      .then((res) => setExclusions(res.exclusions))
      .catch(() => setError("No se pudieron cargar las exclusiones"));
  }, [evaluationId, assignmentId]);

  async function toggleSub(subindicatorId: string) {
    if (!exclusions) return;
    const key = `${subindicatorId}::`;
    const existing = exclusions.find((e) => e.subindicatorId === subindicatorId && e.elementId === null);
    setBusyKey(key);
    setError(null);
    try {
      if (existing) {
        await api.del(`/api/evaluations/${evaluationId}/assignments/${assignmentId}/exclusions/${existing.id}`);
        setExclusions((prev) => (prev ?? []).filter((e) => e.id !== existing.id));
      } else {
        const { exclusion } = await api.post<{ exclusion: EvaluationAssignmentExclusion }>(
          `/api/evaluations/${evaluationId}/assignments/${assignmentId}/exclusions`,
          { subindicatorId, elementId: null },
        );
        // Excluir el Subindicador completo vuelve redundantes sus
        // exclusiones puntuales — se limpian del estado local (el server ya
        // las deja vivas en DB, sin efecto porque elementId:null ya cubre
        // todo, pero mostrarlas tildadas-y-deshabilitadas alcanza en UI).
        setExclusions((prev) => [...(prev ?? []), exclusion]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la exclusión");
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleElement(subindicatorId: string, elementId: string) {
    if (!exclusions) return;
    const key = `${subindicatorId}::${elementId}`;
    const existing = exclusions.find((e) => e.subindicatorId === subindicatorId && e.elementId === elementId);
    setBusyKey(key);
    setError(null);
    try {
      if (existing) {
        await api.del(`/api/evaluations/${evaluationId}/assignments/${assignmentId}/exclusions/${existing.id}`);
        setExclusions((prev) => (prev ?? []).filter((e) => e.id !== existing.id));
      } else {
        const { exclusion } = await api.post<{ exclusion: EvaluationAssignmentExclusion }>(
          `/api/evaluations/${evaluationId}/assignments/${assignmentId}/exclusions`,
          { subindicatorId, elementId },
        );
        setExclusions((prev) => [...(prev ?? []), exclusion]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la exclusión");
    } finally {
      setBusyKey(null);
    }
  }

  if (!snapshot || !exclusions) {
    return <p className="empty">Cargando estructura…</p>;
  }

  return (
    <div className="exclusion-editor">
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <ul className="exclusion-editor__list">
        {snapshot.dimensions.map((dim, dimIndex) => (
          <li key={dim.id}>
            <strong>
              {dimIndex + 1}. {dim.title}
            </strong>
            <ul className="exclusion-editor__list">
              {dim.indicators.map((ind, indIndex) => (
                <li key={ind.id}>
                  {ind.title && (
                    <span className="exclusion-editor__ind-title">
                      {dimIndex + 1}.{indIndex + 1} {ind.title}
                    </span>
                  )}
                  <ul className="exclusion-editor__list">
                    {ind.subindicators.map((sub, subIndex) => (
                      <SubindicatorRow
                        key={sub.id}
                        sub={sub}
                        path={`${dimIndex + 1}.${indIndex + 1}.${subIndex + 1}`}
                        exclusions={exclusions}
                        busyKey={busyKey}
                        onToggleSub={toggleSub}
                        onToggleElement={toggleElement}
                      />
                    ))}
                  </ul>
                </li>
              ))}
              {/* Subindicadores directos (VS-029): mismo nivel visual que un
                  Subindicador normal, sin Indicador intermedio. */}
              {dim.subindicators.map((sub, subIndex) => (
                <SubindicatorRow
                  key={sub.id}
                  sub={sub}
                  path={`${dimIndex + 1}.${dim.indicators.length + subIndex + 1}`}
                  exclusions={exclusions}
                  busyKey={busyKey}
                  onToggleSub={toggleSub}
                  onToggleElement={toggleElement}
                />
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {exclusions.length > 0 && (
        <p className="exclusion-editor__summary">
          <Pill variant="accent">{exclusions.filter((e) => e.elementId === null).length} Subindicador(es) excluido(s)</Pill>{" "}
          <Pill variant="accent">{exclusions.filter((e) => e.elementId !== null).length} pregunta(s) excluida(s)</Pill>
        </p>
      )}
    </div>
  );
}
