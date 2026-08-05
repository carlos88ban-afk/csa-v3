"use client";

import {
  componentRegistry,
  evaluateExpression,
  hasAnswer,
  isElementVisible,
  type AnswerValue,
  type Evaluation,
  type EvaluationSnapshot,
  type EvidenceRef,
  type FormElement,
  type ResponseAnswers,
} from "@plataforma-csa/sdk-core";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { Pill } from "@/components/ui";

interface Props {
  params: Promise<{ token: string }>;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

type SnapshotSubindicator = EvaluationSnapshot["dimensions"][number]["indicators"][number]["subindicators"][number];

interface FlatSubindicator {
  dimId: string;
  dimTitle: string;
  indId: string;
  indTitle: string;
  sub: SnapshotSubindicator;
}

// Página pública (ver docs/engines/persistence.md): sin sesión, sin
// requireActiveMember del lado del API. El evaluado responde preguntas sobre
// una Evaluación publicada (VS-009) y el progreso se guarda automáticamente
// — un enlace publicado = una sesión de respuesta compartida (sin identidad
// de evaluado, ver "Decisión central" en la spec).

type QuestionComponentType = Extract<(typeof componentRegistry)[number], { isQuestion: true }>["type"];
const QUESTION_TYPES = new Set<QuestionComponentType>(
  componentRegistry
    .filter((c): c is Extract<(typeof componentRegistry)[number], { isQuestion: true }> => c.isQuestion)
    .map((c) => c.type),
);
function isQuestion(el: FormElement): boolean {
  return QUESTION_TYPES.has(el.type as QuestionComponentType);
}

function flatten(snapshot: EvaluationSnapshot): FlatSubindicator[] {
  const out: FlatSubindicator[] = [];
  for (const dim of snapshot.dimensions) {
    for (const ind of dim.indicators) {
      for (const sub of ind.subindicators) {
        out.push({ dimId: dim.id, dimTitle: dim.title, indId: ind.id, indTitle: ind.title, sub });
      }
    }
  }
  return out;
}

// Elementos ocultos por `visibleIf` (docs/engines/rule.md) no cuentan en el
// progreso — no se le pidieron al evaluado, no son "preguntas sin responder".
function progressOf(sub: SnapshotSubindicator, answers: ResponseAnswers | undefined) {
  const a = answers ?? {};
  const questions = (sub.formSchema?.elements ?? []).filter((el) => isQuestion(el) && isElementVisible(el.visibleIf, a));
  const answered = questions.filter((q) => hasAnswer(a[q.id])).length;
  return { answered, total: questions.length };
}

export default function PublicEvaluationPage({ params }: Props) {
  const { token } = use(params);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [answersBySub, setAnswersBySub] = useState<Record<string, ResponseAnswers>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api
      .get<{ evaluation: Evaluation }>(`/api/public/evaluations/${token}`)
      .then((res) => {
        setEvaluation(res.evaluation);
        const first = flatten(res.evaluation.snapshot)[0];
        setActiveId(first ? first.sub.id : null);
      })
      .catch(() => setNotFound(true));
    api
      .get<{ responses: Array<{ subindicatorId: string; answers: ResponseAnswers }> }>(
        `/api/public/evaluations/${token}/responses`,
      )
      .then((res) => {
        const map: Record<string, ResponseAnswers> = {};
        for (const row of res.responses) map[row.subindicatorId] = row.answers;
        setAnswersBySub(map);
      })
      .catch(() => {});
  }, [token]);

  const flat = useMemo(() => (evaluation ? flatten(evaluation.snapshot) : []), [evaluation]);
  const activeIndex = flat.findIndex((f) => f.sub.id === activeId);
  const active = activeIndex >= 0 ? flat[activeIndex] : null;

  const globalProgress = useMemo(() => {
    let answered = 0;
    let total = 0;
    for (const f of flat) {
      const p = progressOf(f.sub, answersBySub[f.sub.id]);
      answered += p.answered;
      total += p.total;
    }
    return total === 0 ? 0 : Math.round((answered / total) * 100);
  }, [flat, answersBySub]);

  // Mismo patrón que el Form Editor del Builder (form.md): el autosave se
  // dispara solo desde la mutación explícita de una respuesta, nunca por un
  // efecto reactivo — así hidratar `answersBySub` al cargar no dispara un PUT.
  function scheduleAutosave(subindicatorId: string, answers: ResponseAnswers) {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      setSaveStatus("saving");
      setSaveError(null);
      try {
        await api.put(`/api/public/evaluations/${token}/responses/${subindicatorId}`, { answers });
        setSaveStatus("saved");
      } catch (err) {
        setSaveStatus("error");
        setSaveError(err instanceof Error ? err.message : "No se pudo guardar");
      }
    }, 1500);
  }

  function setAnswer(elementId: string, value: AnswerValue) {
    if (!active) return;
    const subId = active.sub.id;
    const next = { ...(answersBySub[subId] ?? {}), [elementId]: value };
    setAnswersBySub((prev) => ({ ...prev, [subId]: next }));
    scheduleAutosave(subId, next);
  }

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function goTo(index: number) {
    const target = flat[index];
    if (target) setActiveId(target.sub.id);
  }

  if (notFound) return <main className="page">Este enlace no existe o ya no está disponible.</main>;
  if (!evaluation || !active) return <main className="loading">Cargando...</main>;

  const { snapshot } = evaluation;

  return (
    <main className="runtime-layout">
      <nav className="runtime-nav" aria-label="Navegación de la evaluación">
        <div className="runtime-nav__head">
          <strong>{snapshot.frameworkName}</strong>
          <Pill variant="accent">{globalProgress}% completado</Pill>
        </div>

        {snapshot.dimensions.map((dim) => (
          <div key={dim.id} className="runtime-nav__dim">
            <button type="button" className="runtime-nav__toggle" onClick={() => toggleCollapsed(dim.id)}>
              <span className="runtime-nav__caret">{collapsed.has(dim.id) ? "▸" : "▾"}</span>
              {dim.title}
            </button>

            {!collapsed.has(dim.id) &&
              dim.indicators.map((ind) => (
                <div key={ind.id} className="runtime-nav__ind">
                  <button type="button" className="runtime-nav__toggle" onClick={() => toggleCollapsed(ind.id)}>
                    <span className="runtime-nav__caret">{collapsed.has(ind.id) ? "▸" : "▾"}</span>
                    {ind.title}
                  </button>

                  {!collapsed.has(ind.id) &&
                    ind.subindicators.map((sub) => {
                      const p = progressOf(sub, answersBySub[sub.id]);
                      const state = p.total === 0 ? "" : p.answered === 0 ? "neutral" : p.answered === p.total ? "good" : "accent";
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          className={`runtime-nav__sub${sub.id === activeId ? " runtime-nav__sub--active" : ""}`}
                          onClick={() => setActiveId(sub.id)}
                        >
                          <span className={`tree-dot${state ? ` tree-dot--${state}` : ""}`} />
                          {sub.title}
                        </button>
                      );
                    })}
                </div>
              ))}
          </div>
        ))}
      </nav>

      <div className="runtime-content">
        <div className="runtime-topbar">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => goTo(activeIndex - 1)}
            disabled={activeIndex <= 0}
          >
            ‹ Anterior
          </button>
          {/* 4.1.3 Status Messages — ver docs/architecture/accessibility.md */}
          <div className="runtime-topbar__status" aria-live="polite">
            {saveStatus === "saving" && <Pill variant="accent">Guardando…</Pill>}
            {saveStatus === "saved" && <Pill variant="good">Guardado</Pill>}
            {saveStatus === "error" && <Pill variant="warn">Error al guardar</Pill>}
          </div>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => goTo(activeIndex + 1)}
            disabled={activeIndex >= flat.length - 1}
          >
            Siguiente ›
          </button>
        </div>
        {saveStatus === "error" && (
          <p className="alert" role="alert">
            {saveError}
          </p>
        )}

        <p className="runtime-breadcrumb-mini">
          {active.dimTitle} › {active.indTitle}
        </p>
        <h1>{active.sub.title}</h1>
        {active.sub.description && <p>{active.sub.description}</p>}

        {!active.sub.formSchema || active.sub.formSchema.elements.length === 0 ? (
          <p className="empty">Este formulario todavía no tiene elementos.</p>
        ) : (
          <div className="runtime-elements">
            {active.sub.formSchema.elements
              .filter((el) => isElementVisible(el.visibleIf, answersBySub[active.sub.id] ?? {}))
              .map((el) => (
                <ElementView
                  key={el.id}
                  token={token}
                  subindicatorId={active.sub.id}
                  element={el}
                  answers={answersBySub[active.sub.id] ?? {}}
                  value={answersBySub[active.sub.id]?.[el.id]}
                  onChange={(value) => setAnswer(el.id, value)}
                />
              ))}
          </div>
        )}
      </div>
    </main>
  );
}

interface ElementViewProps {
  token: string;
  subindicatorId: string;
  element: FormElement;
  answers: ResponseAnswers;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Componente del tipo `evidencia` (ver docs/engines/evidences.md): el
// navegador sube el binario directo a R2 con una presigned URL generada por
// el servidor; solo las refs (key/nombre/tamaño/tipo) viven en la Respuesta.
function EvidenceView({
  token,
  subindicatorId,
  element,
  value,
  onChange,
}: {
  token: string;
  subindicatorId: string;
  element: Extract<FormElement, { type: "evidencia" }>;
  value: EvidenceRef[] | undefined;
  onChange: (value: EvidenceRef[]) => void;
}) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const refs = value ?? [];
  const maxFiles = element.maxFiles ?? 5;
  const maxSizeMb = element.maxSizeMb ?? 10;
  const accept = element.acceptedTypes?.length
    ? element.acceptedTypes
        .map((t) => (t.includes("/") ? t : `.${t.replace(/^\./, "")}`))
        .join(",")
    : undefined;

  function removeRef(key: string) {
    void api
      .del(`/api/public/evaluations/${token}/evidences`, { key })
      .then(() => onChange(refs.filter((r) => r.key !== key)))
      .catch(() => {});
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError(null);
    const list = Array.from(files).slice(0, maxFiles - refs.length);
    if (list.length === 0) {
      setUploadError(`Máximo ${maxFiles} archivo(s)`);
      return;
    }
    for (const file of list) {
      if (file.size > maxSizeMb * 1024 * 1024) {
        setUploadError(`${file.name} supera el máximo de ${maxSizeMb} MB`);
        continue;
      }
      setUploading(file.name);
      try {
        const { key, url } = await api.post<{ key: string; url: string }>(
          `/api/public/evaluations/${token}/evidences/presign`,
          {
            subindicatorId,
            elementId: element.id,
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            size: file.size,
          },
        );
        const putRes = await fetch(url, { method: "PUT", body: file });
        if (!putRes.ok) throw new Error(`Upload HTTP_${putRes.status}`);
        onChange([...refs, { key, name: file.name, size: file.size, mimeType: file.type || "application/octet-stream" }]);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "No se pudo subir el archivo");
      } finally {
        setUploading(null);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  async function downloadRef(ref: EvidenceRef) {
    try {
      const { url } = await api.post<{ url: string }>(
        `/api/public/evaluations/${token}/evidences/download-url`,
        { key: ref.key },
      );
      window.open(url, "_blank", "noopener");
    } catch {
      setUploadError("No se pudo generar el enlace de descarga");
    }
  }

  return (
    <div className="runtime-evidence">
      <input ref={inputRef} type="file" multiple={maxFiles > 1} accept={accept} onChange={(e) => void handleFiles(e.target.files)} />
      {uploading && <p className="runtime-evidence__uploading">Subiendo {uploading}…</p>}
      {uploadError && (
        <p className="runtime-evidence__error" role="alert">
          {uploadError}
        </p>
      )}
      {refs.length > 0 && (
        <ul className="runtime-evidence__list">
          {refs.map((ref) => (
            <li key={ref.key} className="runtime-evidence__item">
              <span className="runtime-evidence__name" title={ref.name}>
                {ref.name}
              </span>
              <span className="runtime-evidence__meta">{formatBytes(ref.size)}</span>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => void downloadRef(ref)}>
                Descargar
              </button>
              <button type="button" className="btn btn--danger btn--sm" onClick={() => removeRef(ref.key)}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Elemento `calculado` (docs/engines/formula.md): de solo lectura, el
// Runtime recalcula la expresión contra las respuestas numéricas actuales
// del Subindicador en cada render y —si el resultado cambia— lo autoguarda
// por el mismo camino que cualquier respuesta (participa en progreso/CSV
// exactamente igual que una pregunta normal).
function CalculadoView({
  element,
  answers,
  onChange,
}: {
  element: Extract<FormElement, { type: "calculado" }>;
  answers: ResponseAnswers;
  onChange: (value: number) => void;
}) {
  const numericValues: Record<string, number> = {};
  for (const [id, val] of Object.entries(answers)) {
    if (typeof val === "number") numericValues[id] = val;
  }
  const computed = evaluateExpression(element.expression, numericValues);

  useEffect(() => {
    if (computed !== undefined && answers[element.id] !== computed) {
      onChange(computed);
    }
    // Solo depende del valor recalculado — no de `onChange` (se recrea cada
    // render) ni de `answers` completo (ya está reflejado en `computed`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computed]);

  const decimals = element.decimals ?? 2;
  const display = computed === undefined ? "" : String(Number(computed.toFixed(decimals)));

  return (
    <div className="field runtime-question">
      <span className="field__label">{element.label || <em>(sin texto)</em>}</span>
      {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}
      <input value={display} disabled readOnly placeholder="(sin calcular)" />
    </div>
  );
}

function ElementView({ token, subindicatorId, element, answers, value, onChange }: ElementViewProps) {
  if (element.type === "instruccion") {
    return <p className="runtime-instruction">{element.label}</p>;
  }

  if (element.type === "banner") {
    return <p className={`runtime-banner runtime-banner--${element.variant}`}>{element.label}</p>;
  }

  if (element.type === "calculado") {
    return <CalculadoView element={element} answers={answers} onChange={(next) => onChange(next)} />;
  }

  if (element.type === "evidencia") {
    const refs = Array.isArray(value) && value.length > 0 && typeof value[0] === "object" ? (value as EvidenceRef[]) : [];
    return (
      <div className="field runtime-question">
        <span className="field__label">
          {element.label || <em>(sin texto)</em>} {element.required && <Pill variant="warn">obligatorio</Pill>}
        </span>
        {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}
        <EvidenceView token={token} subindicatorId={subindicatorId} element={element} value={refs} onChange={(next) => onChange(next)} />
      </div>
    );
  }

  return (
    <div className="field runtime-question">
      <span className="field__label">
        {element.label || <em>(sin texto)</em>} {element.required && <Pill variant="warn">obligatorio</Pill>}
      </span>
      {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}

      {element.type === "texto_corto" && (
        <input value={(value as string) ?? ""} maxLength={element.maxLength} onChange={(e) => onChange(e.target.value)} />
      )}

      {element.type === "texto_largo" && (
        <textarea
          value={(value as string) ?? ""}
          maxLength={element.maxLength}
          rows={4}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {element.type === "numero" && (
        <input
          type="number"
          value={value === undefined ? "" : (value as number)}
          min={element.min}
          max={element.max}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
      )}

      {element.type === "seleccion_unica" && (
        <div className="runtime-options">
          {element.options.map((opt) => (
            <label key={opt.id} className="field--checkbox">
              <input type="radio" name={element.id} checked={value === opt.id} onChange={() => onChange(opt.id)} />
              {opt.label}
            </label>
          ))}
        </div>
      )}

      {element.type === "seleccion_multiple" &&
        (() => {
          const selected = Array.isArray(value) && typeof value[0] === "string" ? (value as string[]) : [];
          return (
            <div className="runtime-options">
              {element.options.map((opt) => (
                <label key={opt.id} className="field--checkbox">
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.id)}
                    onChange={(e) =>
                      onChange(e.target.checked ? [...selected, opt.id] : selected.filter((id) => id !== opt.id))
                    }
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          );
        })()}
    </div>
  );
}
