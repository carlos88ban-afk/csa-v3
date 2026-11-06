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
  historyKey,
  parseReviewHistory,
  reviewKey,
  statusKey,
  subindicatorNumber,
  type DerivedStatus,
  type Evaluation,
  type EvaluationSnapshot,
  type FormElement,
  type ResponseAnswers,
} from "@plataforma-csa/sdk-core";
import { use, useEffect, useState } from "react";
import { formatAnswer } from "@/lib/evaluation-export";
import { api } from "@/lib/api-client";
import { Breadcrumb, Button, Card, Pill } from "@/components/ui";
import { RichLabel } from "@/components/rich-label";

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
  completed: "Lista para revisar",
  approved: "Aprobada",
  submitted: "Entregada",
};

const ACTION_LABEL = { approved: "Aprobó", delivered: "Entregó", returned: "Devolvió" } as const;

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusVariant(status: DerivedStatus): "neutral" | "accent" | "good" | "warn" {
  if (status === "submitted") return "good";
  if (status === "approved") return "accent";
  return "neutral";
}

type SnapshotSubindicator = EvaluationSnapshot["dimensions"][number]["indicators"][number]["subindicators"][number];

type SetStatus = (
  subindicatorId: string,
  elementId: string,
  status: "completed" | "approved" | "submitted" | null,
  comment?: string,
) => Promise<boolean>;

function QuestionReviewRow({
  evaluationId,
  subId,
  el,
  index,
  answers,
  pending,
  setStatus,
}: {
  evaluationId: string;
  subId: string;
  el: FormElement;
  index: number;
  answers: ResponseAnswers;
  pending: string | null;
  setStatus: SetStatus;
}) {
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const na = answers[naKey(el.id)] as string | undefined;
  const markedNA = na === "true";
  const rawComment = (answers[commentKey(el.id)] as string | undefined) ?? "";
  const comment = rawComment.replace(/<[^>]*>/g, "").trim() === "" ? "" : rawComment;
  const derived = deriveStatus(answers[statusKey(el.id)] as string | undefined, isAnswered(answers[el.id], na));
  const observation = (answers[reviewKey(el.id)] as string | undefined) ?? "";
  const history = parseReviewHistory(answers[historyKey(el.id)]);
  const isReturned = observation !== "" && derived !== "completed" && derived !== "approved" && derived !== "submitted";
  const busy = pending === `${subId}:${el.id}`;
  const canApprove = derived === "completed";
  const canSubmit = derived === "approved";
  const canRevert = derived === "completed" || derived === "approved" || derived === "submitted";
  const revertTo = derived === "submitted" ? "approved" : derived === "approved" ? "completed" : null;
  const answerText = markedNA ? "" : formatAnswer(el, answers[el.id], markedNA, answers);

  async function confirmReturn() {
    const ok = await setStatus(subId, el.id, revertTo, note.trim());
    if (ok) {
      setReturning(false);
      setNote("");
    }
  }

  return (
    <li className="entry-list__row" style={{ flexWrap: "wrap" }}>
      <span className="entry-list__main">
        {questionNumber(index)} <RichLabel html={el.label ?? ""} fallback="(sin texto)" />{" "}
        {isReturned ? <Pill variant="warn">Devuelta para corregir</Pill> : <Pill variant={statusVariant(derived)}>{STATUS_LABEL[derived]}</Pill>}
        {markedNA && <Pill variant="warn">N/A</Pill>}
        {answerText && (
          <p className="comment-preview" style={{ whiteSpace: "pre-wrap" }}>
            <strong>Respuesta:</strong> {answerText}
          </p>
        )}
        {el.type === "evidencia" && Array.isArray(answers[el.id]) && (answers[el.id] as unknown[]).length > 0 && (
          <p className="comment-preview">
            {(answers[el.id] as Array<{ key?: string; name?: string }>).map((f) => (
              <button
                key={f.key}
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={async () => {
                  const r = await api.post<{ url: string }>(`/api/evaluations/${evaluationId}/evidences/download-url`, { key: f.key });
                  window.open(r.url, "_blank");
                }}
              >
                Descargar {f.name}
              </button>
            ))}
          </p>
        )}
        {comment && (
          <p className="comment-preview">
            Comentario confidencial: <span dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(comment) }} />
          </p>
        )}
        {isReturned && (
          <p className="comment-preview" style={{ whiteSpace: "pre-wrap" }}>
            <strong>Observación pendiente:</strong> {observation}
          </p>
        )}
        {history.length > 0 && (
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? "Ocultar historial" : `Ver historial (${history.length})`}
            </button>
            {showHistory && (
              <ul className="comment-preview">
                {history.map((ev, i) => (
                  <li key={i}>
                    {formatEventDate(ev.at)} · {ev.by} {ACTION_LABEL[ev.action]}
                    {ev.text ? `: ${ev.text}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </span>
      <span className="entry-list__actions">
        <Button type="button" variant="primary" size="sm" disabled={!canApprove || busy} onClick={() => void setStatus(subId, el.id, "approved")}>
          Aprobar
        </Button>
        <Button type="button" variant="primary" size="sm" disabled={!canSubmit || busy} onClick={() => void setStatus(subId, el.id, "submitted")}>
          Entregar
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={!canRevert || busy} onClick={() => setReturning((v) => !v)}>
          Devolver
        </Button>
      </span>
      {returning && (
        <div style={{ flexBasis: "100%" }}>
          <label>
            ¿Qué debe corregir el evaluado? (obligatorio)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              style={{ width: "100%" }}
            />
          </label>
          <Button type="button" variant="primary" size="sm" disabled={note.trim() === "" || busy} onClick={() => void confirmReturn()}>
            Devolver con observación
          </Button>{" "}
          <Button type="button" variant="secondary" size="sm" onClick={() => setReturning(false)}>
            Cancelar
          </Button>
        </div>
      )}
    </li>
  );
}

// Extraído para reusarse en dos sitios: Subindicadores bajo Indicador y
// Subindicadores directos bajo Dimensión (VS-029, docs/domain/evaluation-hierarchy.md)
// — mismo contenido de tarjeta, solo cambia de dónde cuelga en el árbol.
function SubindicatorReviewCard({
  evaluationId,
  unitId,
  sub,
  subNumber,
  answers,
  pending,
  setStatus,
}: {
  evaluationId: string;
  unitId: string;
  sub: SnapshotSubindicator;
  subNumber: string;
  answers: ResponseAnswers;
  pending: string | null;
  setStatus: (
    subindicatorId: string,
    elementId: string,
    status: "completed" | "approved" | "submitted" | null,
    comment?: string,
  ) => Promise<boolean>;
}) {
  const questions = (sub.formSchema?.elements ?? []).filter(
    (el) => isQuestion(el) && (!el.appliesTo || el.appliesTo.includes(unitId)) && isElementVisible(el.visibleIf, answers),
  );
  if (questions.length === 0) return null;
  return (
    <Card>
      <h4>
        {subNumber} {sub.title}
      </h4>
      <ul className="entry-list">
        {questions.map((el, qIndex) => (
          <QuestionReviewRow
            evaluationId={evaluationId}
            key={el.id}
            subId={sub.id}
            el={el}
            index={qIndex}
            answers={answers}
            pending={pending}
            setStatus={setStatus}
          />
        ))}
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
  const [unitId, setUnitId] = useState<string | null>(null);
  const [unitLabel, setUnitLabel] = useState("");

  function loadResponses(unit: string | null = unitId) {
    if (!unit) return;
    api
      .get<{ responses: Array<{ subindicatorId: string; answers: ResponseAnswers }> }>(
        `/api/evaluations/${evaluationId}/responses?unit=${unit}`,
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
    const unit = new URLSearchParams(window.location.search).get("unit");
    setUnitId(unit);
    loadResponses(unit);
    if (unit) {
      api
        .get<{ units: Array<{ id: string; name: string; sigla: string | null }> }>("/api/units")
        .then((r) => {
          const u = r.units.find((x) => x.id === unit);
          if (u) setUnitLabel(u.sigla ? `${u.sigla} — ${u.name}` : u.name);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluationId]);

  async function setStatus(
    subindicatorId: string,
    elementId: string,
    status: "completed" | "approved" | "submitted" | null,
    comment?: string,
  ): Promise<boolean> {
    const actionKey = `${subindicatorId}:${elementId}`;
    setPending(actionKey);
    setActionError(null);
    try {
      await api.patch(`/api/evaluations/${evaluationId}/responses/${subindicatorId}/status?unit=${unitId}`, { elementId, status, comment });
      loadResponses();
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo actualizar el estado");
      return false;
    } finally {
      setPending(null);
    }
  }

  if (notFound) return <main className="page">Esta evaluación no existe o no pertenece a tu organización.</main>;
  if (!evaluation) return <main className="loading">Cargando...</main>;

  const { snapshot } = evaluation;
  if (!unitId)
    return (
      <main className="page">
        <h1>Revisión</h1>
        <p className="page__lead">Elige una unidad desde la pantalla de <a href="/evaluations">Evaluación</a> para revisar sus respuestas.</p>
      </main>
    );

  return (
    <main className="page">
      {/* VS-054: la pantalla intermedia /frameworks/[frameworkId] se
          eliminó (ver docs/domain/business-units.md, "Panel Publicar") —
          "Framework" ahora enlaza al Builder, que reemplazó su función. */}
      <Breadcrumb
        items={[
          { label: "Evaluación", href: "/evaluations" },
          { label: evaluation.title },
          { label: "Revisión" },
        ]}
      />
      <h1>Revisión — {evaluation.title}{unitLabel ? ` · ${unitLabel}` : ""}</h1>
      <p className="page__lead">
        Cada respuesta avanza así: <strong>Lista para revisar</strong> → <strong>Aprobada</strong> →{" "}
        <strong>Entregada</strong>. Con <strong>Devolver</strong> regresa un paso para que se corrija.
      </p>
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
                  evaluationId={evaluationId}
                  unitId={unitId}
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
              evaluationId={evaluationId}
              unitId={unitId}
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
