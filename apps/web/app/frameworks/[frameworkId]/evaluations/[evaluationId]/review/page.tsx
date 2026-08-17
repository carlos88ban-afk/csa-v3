"use client";

import {
  commentKey,
  componentRegistry,
  deriveStatus,
  dimensionNumber,
  directSubindicatorNumber,
  indicatorNumber,
  isAnswered,
  isElementVisible,
  naKey,
  questionNumber,
  sanitizeCommentHtml,
  statusKey,
  subindicatorNumber,
  type DerivedStatus,
  type Evaluation,
  type EvaluationSnapshot,
  type FormElement,
  type ResponseAnswers,
} from "@plataforma-csa/sdk-core";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Breadcrumb, Button, Card, Pill } from "@/components/ui";

// VS-018 (docs/engines/persistence.md, "Estado por pregunta + flujo
// Approved/Submitted"): página nueva, autenticada, bajo la jerarquía del
// Builder (no bajo /evaluations/[token], que es la ruta pública) — evita
// cualquier ambigüedad de ruteo con el token público. Un miembro owner/editor
// revisa las respuestas ya capturadas y decide Aprobar/Enviar/Revertir por
// pregunta; el evaluado (lado público) nunca ve estas dos transiciones.

interface Props {
  params: Promise<{ frameworkId: string; evaluationId: string }>;
}

type QuestionComponentType = Extract<(typeof componentRegistry)[number], { isQuestion: true }>["type"];
const QUESTION_TYPES = new Set<QuestionComponentType>(
  componentRegistry.filter((c): c is Extract<(typeof componentRegistry)[number], { isQuestion: true }> => c.isQuestion).map((c) => c.type),
);
function isQuestion(el: FormElement): boolean {
  return QUESTION_TYPES.has(el.type as QuestionComponentType);
}

const STATUS_LABEL: Record<DerivedStatus, string> = {
  not_started: "Sin iniciar",
  in_progress: "En progreso",
  completed: "Completado",
  approved: "Aprobado",
  submitted: "Enviado",
};

function statusVariant(status: DerivedStatus): "neutral" | "accent" | "good" | "warn" {
  if (status === "submitted") return "good";
  if (status === "approved") return "accent";
  return "neutral";
}

type SnapshotSubindicator = EvaluationSnapshot["dimensions"][number]["indicators"][number]["subindicators"][number];

// Extraído para reusarse en dos sitios: Subindicadores bajo Indicador y
// Subindicadores directos bajo Dimensión (VS-029, docs/domain/evaluation-hierarchy.md)
// — mismo contenido de tarjeta, solo cambia de dónde cuelga en el árbol.
function SubindicatorReviewCard({
  sub,
  subNumber,
  answers,
  pending,
  setStatus,
}: {
  sub: SnapshotSubindicator;
  subNumber: string;
  answers: ResponseAnswers;
  pending: string | null;
  setStatus: (subindicatorId: string, elementId: string, status: "completed" | "approved" | "submitted" | null) => void;
}) {
  const questions = (sub.formSchema?.elements ?? []).filter((el) => isQuestion(el) && isElementVisible(el.visibleIf, answers));
  if (questions.length === 0) return null;
  return (
    <Card>
      <h4>
        {subNumber} {sub.title}
      </h4>
      <ul className="entry-list">
        {questions.map((el, qIndex) => {
          const na = answers[naKey(el.id)] as string | undefined;
          const markedNA = na === "true";
          const comment = (answers[commentKey(el.id)] as string | undefined) ?? "";
          const derived = deriveStatus(answers[statusKey(el.id)] as string | undefined, isAnswered(answers[el.id], na));
          const actionKey = `${sub.id}:${el.id}`;
          const busy = pending === actionKey;
          const canApprove = derived === "completed";
          const canSubmit = derived === "approved";
          const canRevert = derived === "completed" || derived === "approved" || derived === "submitted";
          const revertTo = derived === "submitted" ? "approved" : derived === "approved" ? "completed" : null;
          return (
            <li key={el.id} className="entry-list__row">
              <span className="entry-list__main">
                {questionNumber(qIndex)} {el.label || "(sin texto)"}{" "}
                <Pill variant={statusVariant(derived)}>{STATUS_LABEL[derived]}</Pill>
                {markedNA && <Pill variant="warn">N/A</Pill>}
                {comment && (
                  <p className="comment-preview">
                    Comentario confidencial: <span dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(comment) }} />
                  </p>
                )}
              </span>
              <span className="entry-list__actions">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={!canApprove || busy}
                  onClick={() => void setStatus(sub.id, el.id, "approved")}
                >
                  Aprobar
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={!canSubmit || busy}
                  onClick={() => void setStatus(sub.id, el.id, "submitted")}
                >
                  Enviar
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!canRevert || busy}
                  onClick={() => void setStatus(sub.id, el.id, revertTo)}
                >
                  Revertir
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export default function ReviewPage({ params }: Props) {
  const { frameworkId, evaluationId } = use(params);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [answersBySub, setAnswersBySub] = useState<Record<string, ResponseAnswers>>({});
  const [notFound, setNotFound] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function loadResponses() {
    api
      .get<{ responses: Array<{ subindicatorId: string; answers: ResponseAnswers }> }>(
        `/api/evaluations/${evaluationId}/responses`,
      )
      .then((res) => {
        const map: Record<string, ResponseAnswers> = {};
        for (const row of res.responses) map[row.subindicatorId] = row.answers;
        setAnswersBySub(map);
      });
  }

  useEffect(() => {
    api
      .get<{ evaluation: Evaluation }>(`/api/evaluations/${evaluationId}`)
      .then((res) => setEvaluation(res.evaluation))
      .catch(() => setNotFound(true));
    loadResponses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluationId]);

  async function setStatus(subindicatorId: string, elementId: string, status: "completed" | "approved" | "submitted" | null) {
    const actionKey = `${subindicatorId}:${elementId}`;
    setPending(actionKey);
    setActionError(null);
    try {
      await api.patch(`/api/evaluations/${evaluationId}/responses/${subindicatorId}/status`, { elementId, status });
      loadResponses();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo actualizar el estado");
    } finally {
      setPending(null);
    }
  }

  if (notFound) return <main className="page">Esta evaluación no existe o no pertenece a tu organización.</main>;
  if (!evaluation) return <main className="loading">Cargando...</main>;

  const { snapshot } = evaluation;

  return (
    <main className="page">
      {/* VS-054: la pantalla intermedia /frameworks/[frameworkId] se
          eliminó (ver docs/domain/business-units.md, "Panel Publicar") —
          "Framework" ahora enlaza al Builder, que reemplazó su función. */}
      <Breadcrumb
        items={[
          { label: "Frameworks", href: "/frameworks" },
          { label: "Framework", href: `/frameworks/${frameworkId}/builder` },
          { label: "Revisión" },
        ]}
      />
      <h1>Revisión — {evaluation.title}</h1>
      {actionError && <p className="alert" role="alert">{actionError}</p>}

      {snapshot.dimensions.map((dim, dimIndex) => (
        <div key={dim.id}>
          <h2>
            {dimensionNumber(dimIndex)} {dim.title}
          </h2>
          {dim.indicators.map((ind, indIndex) => (
            <div key={ind.id}>
              <h3>
                {indicatorNumber(dimIndex, indIndex)} {ind.title}
              </h3>
              {ind.subindicators.map((sub, subIndex) => (
                <SubindicatorReviewCard
                  key={sub.id}
                  sub={sub}
                  subNumber={subindicatorNumber(dimIndex, indIndex, subIndex)}
                  answers={answersBySub[sub.id] ?? {}}
                  pending={pending}
                  setStatus={setStatus}
                />
              ))}
            </div>
          ))}
          {/* Subindicadores directos (VS-029): sin Indicador intermedio,
              numerados después de todos los Indicadores de la Dimensión. */}
          {dim.subindicators.map((sub, subIndex) => (
            <SubindicatorReviewCard
              key={sub.id}
              sub={sub}
              subNumber={directSubindicatorNumber(dimIndex, dim.indicators.length, subIndex)}
              answers={answersBySub[sub.id] ?? {}}
              pending={pending}
              setStatus={setStatus}
            />
          ))}
        </div>
      ))}
    </main>
  );
}
