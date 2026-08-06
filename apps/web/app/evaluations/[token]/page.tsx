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
  // Id del Subindicador recién tocado por el evaluado (ver setAnswer). null =
  // ningún cambio local todavía, así el efecto de autosave no dispara al
  // hidratar `answersBySub` desde el GET inicial de respuestas guardadas.
  const dirtySubRef = useRef<string | null>(null);

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
        // El formulario ya es interactivo apenas carga `evaluation` (efecto
        // separado, en paralelo) — si el evaluado responde algo antes de que
        // ESTE fetch resuelva, un overwrite ciego perdería esa respuesta. Las
        // ediciones locales (ya en `prev`) son más recientes que la foto
        // guardada, así que ganan por sobre lo recién llegado del servidor.
        setAnswersBySub((prev) => {
          const merged: Record<string, ResponseAnswers> = { ...map };
          for (const [subId, localAnswers] of Object.entries(prev)) {
            merged[subId] = { ...(merged[subId] ?? {}), ...localAnswers };
          }
          return merged;
        });
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

  // El updater de un setState NO se ejecuta de forma síncrona de manera
  // garantizada (la "eager state" es un detalle de implementación interno,
  // no un contrato) — leer su resultado justo después de llamar al setter
  // (como hacía una versión anterior de este código) podía capturar
  // `undefined` y mandar un autosave vacío. El patrón correcto: la mutación
  // solo marca QUÉ Subindicador cambió (`dirtySubRef`, un ref — su escritura
  // sí es síncrona); un efecto separado dispara el autosave a partir del
  // estado ya comprometido por React, nunca por lectura especulativa.
  function setAnswer(elementId: string, value: AnswerValue) {
    if (!active) return;
    const subId = active.sub.id;
    dirtySubRef.current = subId;
    setAnswersBySub((prev) => ({
      ...prev,
      [subId]: { ...(prev[subId] ?? {}), [elementId]: value },
    }));
  }

  // Se dispara con cada commit de `answersBySub` — incluida la hidratación
  // inicial — pero `dirtySubRef` sigue en null hasta la primera mutación real
  // del evaluado, así que la hidratación nunca agenda un autosave.
  useEffect(() => {
    const subId = dirtySubRef.current;
    if (!subId) return;
    const answers = answersBySub[subId];
    if (!answers) return;
    scheduleAutosave(subId, answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answersBySub]);

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
                  onAnswerChange={setAnswer}
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
  // Opciones anidadas (docs/engines/form.md, "Opciones anidadas VS-016"): las
  // sub-opciones marcadas se guardan bajo una clave sintética
  // `${elementId}::${optionId}` en el mismo mapa de answers, no en `value`
  // (que sigue siendo solo la respuesta del elemento padre) — por eso este
  // componente necesita poder escribir claves arbitrarias, no solo la propia.
  onAnswerChange: (key: string, value: AnswerValue) => void;
}

// Sub-checklist revelado bajo una opción seleccionada que tiene subOptions
// (docs/engines/form.md, "Opciones anidadas VS-016"). Siempre selección
// múltiple, sea cual sea el tipo del elemento padre — mismo patrón que S&P.
function SubOptionsView({
  subKey,
  subOptions,
  value,
  onChange,
}: {
  subKey: string;
  subOptions: { id: string; label: string }[];
  value: AnswerValue | undefined;
  onChange: (value: string[]) => void;
}) {
  const selected = Array.isArray(value) && typeof value[0] === "string" ? (value as string[]) : [];
  return (
    <div className="sub-options runtime-options" key={subKey}>
      {subOptions.map((sub) => (
        <label key={sub.id} className="field--checkbox">
          <input
            type="checkbox"
            checked={selected.includes(sub.id)}
            onChange={(e) => onChange(e.target.checked ? [...selected, sub.id] : selected.filter((id) => id !== sub.id))}
          />
          {sub.label}
        </label>
      ))}
    </div>
  );
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
    <label className="field runtime-question">
      <span className="field__label">{element.label || <em>(sin texto)</em>}</span>
      {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}
      <input value={display} disabled readOnly placeholder="(sin calcular)" />
    </label>
  );
}

// Elemento `url_publica` (docs/engines/form.md, "Campo URL pública VS-017"):
// hasta maxUrls (default 3) inputs de referencia externa, sin subida de
// archivo. Slots vacíos nunca se persisten (ver doc) — se filtran recién al
// escribir en `answers`, así hasAnswer() no cuenta un slot en blanco como
// respuesta.
function UrlPublicaView({
  element,
  value,
  onChange,
}: {
  element: Extract<FormElement, { type: "url_publica" }>;
  value: string[] | undefined;
  onChange: (value: string[]) => void;
}) {
  const maxUrls = element.maxUrls ?? 3;
  const urls = Array.isArray(value) ? value : [];
  // Slots visibles = respuestas guardadas + un slot vacío extra para seguir
  // agregando, acotado a maxUrls.
  const slots = urls.length < maxUrls ? [...urls, ""] : urls;

  function commit(nextSlots: string[]) {
    onChange(nextSlots.map((s) => s.trim()).filter(Boolean));
  }

  function updateSlot(index: number, next: string) {
    const nextSlots = [...slots];
    nextSlots[index] = next;
    commit(nextSlots);
  }

  function removeSlot(index: number) {
    commit(slots.filter((_, i) => i !== index));
  }

  return (
    <div className="runtime-url-list">
      {slots.map((url, index) => (
        <div key={index} className="option-row">
          <input type="url" value={url} placeholder="https://..." onChange={(e) => updateSlot(index, e.target.value)} />
          {url !== "" && (
            <button type="button" className="btn btn--danger btn--sm" onClick={() => removeSlot(index)}>
              Quitar
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function ElementView({ token, subindicatorId, element, answers, value, onChange, onAnswerChange }: ElementViewProps) {
  if (element.type === "instruccion") {
    return <p className="runtime-instruction">{element.label}</p>;
  }

  if (element.type === "banner") {
    return <p className={`runtime-banner runtime-banner--${element.variant}`}>{element.label}</p>;
  }

  if (element.type === "calculado") {
    return <CalculadoView element={element} answers={answers} onChange={(next) => onChange(next)} />;
  }

  if (element.type === "url_publica") {
    const urls = Array.isArray(value) && (value.length === 0 || typeof value[0] === "string") ? (value as string[]) : [];
    return (
      <fieldset className="field runtime-question">
        <legend className="field__label">
          {element.label || <em>(sin texto)</em>} {element.required && <Pill variant="warn">obligatorio</Pill>}
        </legend>
        {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}
        <UrlPublicaView element={element} value={urls} onChange={(next) => onChange(next)} />
      </fieldset>
    );
  }

  if (element.type === "evidencia") {
    const refs = Array.isArray(value) && value.length > 0 && typeof value[0] === "object" ? (value as EvidenceRef[]) : [];
    return (
      <fieldset className="field runtime-question">
        <legend className="field__label">
          {element.label || <em>(sin texto)</em>} {element.required && <Pill variant="warn">obligatorio</Pill>}
        </legend>
        {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}
        <EvidenceView token={token} subindicatorId={subindicatorId} element={element} value={refs} onChange={(next) => onChange(next)} />
      </fieldset>
    );
  }

  // texto_corto/texto_largo/numero: un solo control -> <label> (asocia el
  // nombre accesible directo al input, ver docs/architecture/accessibility.md).
  if (element.type === "texto_corto" || element.type === "texto_largo" || element.type === "numero") {
    return (
      <label className="field runtime-question">
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
      </label>
    );
  }

  // seleccion_unica/seleccion_multiple: grupo de varios controles -> <fieldset>
  // + <legend> nombra el grupo; cada opción ya tiene su propio <label>.
  return (
    <fieldset className="field runtime-question">
      <legend className="field__label">
        {element.label || <em>(sin texto)</em>} {element.required && <Pill variant="warn">obligatorio</Pill>}
      </legend>
      {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}

      {element.type === "seleccion_unica" && (
        <div className="runtime-options">
          {element.options.map((opt) => (
            <div key={opt.id} className="option-row-group">
              <label className="field--checkbox">
                <input type="radio" name={element.id} checked={value === opt.id} onChange={() => onChange(opt.id)} />
                {opt.label}
              </label>
              {value === opt.id && opt.subOptions && opt.subOptions.length > 0 && (
                <SubOptionsView
                  subKey={`${element.id}::${opt.id}`}
                  subOptions={opt.subOptions}
                  value={answers[`${element.id}::${opt.id}`]}
                  onChange={(next) => onAnswerChange(`${element.id}::${opt.id}`, next)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {element.type === "seleccion_multiple" &&
        (() => {
          const selected = Array.isArray(value) && typeof value[0] === "string" ? (value as string[]) : [];
          return (
            <div className="runtime-options">
              {element.options.map((opt) => (
                <div key={opt.id} className="option-row-group">
                  <label className="field--checkbox">
                    <input
                      type="checkbox"
                      checked={selected.includes(opt.id)}
                      onChange={(e) =>
                        onChange(e.target.checked ? [...selected, opt.id] : selected.filter((id) => id !== opt.id))
                      }
                    />
                    {opt.label}
                  </label>
                  {selected.includes(opt.id) && opt.subOptions && opt.subOptions.length > 0 && (
                    <SubOptionsView
                      subKey={`${element.id}::${opt.id}`}
                      subOptions={opt.subOptions}
                      value={answers[`${element.id}::${opt.id}`]}
                      onChange={(next) => onAnswerChange(`${element.id}::${opt.id}`, next)}
                    />
                  )}
                </div>
              ))}
            </div>
          );
        })()}
    </fieldset>
  );
}
