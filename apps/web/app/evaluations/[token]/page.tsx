"use client";

import {
  commentKey,
  componentRegistry,
  deriveStatus,
  evaluateExpression,
  hasAnswer,
  isAnswered,
  isElementVisible,
  naKey,
  statusKey,
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
  // VS-019 (docs/engines/persistence.md, "N/A + comentario confidencial"):
  // una pregunta marcada N/A cuenta como resuelta para el progreso.
  const answered = questions.filter((q) => isAnswered(a[q.id], a[naKey(q.id)] as string | undefined)).length;
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
  // VS-020 (docs/engines/persistence.md, "Botones Save/Cancel/Reset"): última
  // foto de `answers` confirmada por el servidor, por Subindicador — permite
  // que Cancel/Reset vuelvan atrás sin recargar la página. Ref, no state: es
  // una caché de lectura para los botones, no debe disparar un re-render.
  const lastSavedBySub = useRef<Record<string, ResponseAnswers>>({});

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
        lastSavedBySub.current = map;
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
  // VS-020: "¿hay cambios pendientes?" — comparación superficial de JSON,
  // el mapa de answers de un Subindicador es chico (no justifica una
  // librería de diff). Gatea los tres botones Save/Cancel/Reset.
  const dirty = active
    ? JSON.stringify(answersBySub[active.sub.id] ?? {}) !== JSON.stringify(lastSavedBySub.current[active.sub.id] ?? {})
    : false;

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

  // VS-020: extraído de scheduleAutosave para que el botón "Guardar" pueda
  // forzar el mismo guardado ya, sin esperar el debounce.
  async function doSave(subindicatorId: string, answers: ResponseAnswers) {
    setSaveStatus("saving");
    setSaveError(null);
    try {
      await api.put(`/api/public/evaluations/${token}/responses/${subindicatorId}`, { answers });
      lastSavedBySub.current[subindicatorId] = answers;
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  function scheduleAutosave(subindicatorId: string, answers: ResponseAnswers) {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void doSave(subindicatorId, answers);
    }, 1500);
  }

  function handleSave() {
    if (!active) return;
    const subId = active.sub.id;
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    const answers = answersBySub[subId];
    if (answers) void doSave(subId, answers);
  }

  // Cancel y Reset son el mismo botón conceptualmente (decisión confirmada
  // con el usuario, ver docs/engines/persistence.md "Botones Save/Cancel/
  // Reset VS-020") — ambos vuelven a la última foto confirmada por el
  // servidor, descartando ediciones locales no guardadas.
  function handleCancelOrReset() {
    if (!active) return;
    const subId = active.sub.id;
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    dirtySubRef.current = null;
    const saved = lastSavedBySub.current[subId] ?? {};
    setAnswersBySub((prev) => ({ ...prev, [subId]: saved }));
    setSaveStatus("idle");
    setSaveError(null);
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
    setAnswersBySub((prev) => {
      const subAnswers = prev[subId] ?? {};
      const next: ResponseAnswers = { ...subAnswers, [elementId]: value };
      // VS-018 (docs/engines/persistence.md, "Estado por pregunta"): editar
      // la respuesta real de una pregunta ya "completed" la regresa a
      // "in_progress" (derivado) — no aplica a claves sintéticas (sub-opciones
      // VS-016, el propio ::status), esas nunca llevan "::" en un elementId real.
      if (!elementId.includes("::") && subAnswers[statusKey(elementId)] === "completed") {
        delete next[statusKey(elementId)];
      }
      return { ...prev, [subId]: next };
    });
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
          {/* VS-020 (docs/engines/persistence.md, "Botones Save/Cancel/Reset"):
              aditivo sobre el autosave — no lo reemplaza. Cancelar y
              Restablecer comparten la misma función a propósito. */}
          <div className="runtime-topbar__actions">
            <button type="button" className="btn btn--primary btn--sm" onClick={handleSave} disabled={!dirty}>
              Guardar
            </button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={handleCancelOrReset} disabled={!dirty}>
              Cancelar
            </button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={handleCancelOrReset} disabled={!dirty}>
              Restablecer
            </button>
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
  locked,
}: {
  subKey: string;
  subOptions: { id: string; label: string }[];
  value: AnswerValue | undefined;
  onChange: (value: string[]) => void;
  locked?: boolean;
}) {
  const selected = Array.isArray(value) && typeof value[0] === "string" ? (value as string[]) : [];
  return (
    <div className="sub-options runtime-options" key={subKey}>
      {subOptions.map((sub) => (
        <label key={sub.id} className="field--checkbox">
          <input
            type="checkbox"
            disabled={locked}
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
  locked,
}: {
  token: string;
  subindicatorId: string;
  element: Extract<FormElement, { type: "evidencia" }>;
  value: EvidenceRef[] | undefined;
  onChange: (value: EvidenceRef[]) => void;
  locked?: boolean;
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
      {!locked && (
        <input ref={inputRef} type="file" multiple={maxFiles > 1} accept={accept} onChange={(e) => void handleFiles(e.target.files)} />
      )}
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
              {!locked && (
                <button type="button" className="btn btn--danger btn--sm" onClick={() => removeRef(ref.key)}>
                  Quitar
                </button>
              )}
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
  locked,
}: {
  element: Extract<FormElement, { type: "url_publica" }>;
  value: string[] | undefined;
  onChange: (value: string[]) => void;
  locked?: boolean;
}) {
  const maxUrls = element.maxUrls ?? 3;
  const urls = Array.isArray(value) ? value : [];
  // Slots visibles = respuestas guardadas + un slot vacío extra para seguir
  // agregando, acotado a maxUrls. Bloqueado: sin slot extra, solo lectura.
  const slots = !locked && urls.length < maxUrls ? [...urls, ""] : urls;

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
          <input type="url" value={url} disabled={locked} placeholder="https://..." onChange={(e) => updateSlot(index, e.target.value)} />
          {url !== "" && !locked && (
            <button type="button" className="btn btn--danger btn--sm" onClick={() => removeSlot(index)}>
              Quitar
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// VS-018 (docs/engines/persistence.md, "Estado por pregunta"): fila de
// estado + acción "Marcar como completo", compartida por todos los tipos de
// pregunta que capturan respuesta manual (no calculado/instruccion/banner).
function StatusRow({
  elementId,
  derived,
  canComplete,
  onAnswerChange,
}: {
  elementId: string;
  derived: ReturnType<typeof deriveStatus>;
  canComplete: boolean;
  onAnswerChange: (key: string, value: AnswerValue) => void;
}) {
  if (derived === "not_started" || derived === "in_progress") {
    if (!canComplete) return null;
    return (
      <div className="runtime-question__status">
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => onAnswerChange(statusKey(elementId), "completed")}
        >
          Marcar como completo
        </button>
      </div>
    );
  }
  const label = derived === "completed" ? "Completado" : derived === "approved" ? "Aprobado" : "Enviado";
  const variant = derived === "submitted" ? "good" : derived === "approved" ? "accent" : "neutral";
  return (
    <div className="runtime-question__status">
      <Pill variant={variant}>{label}</Pill>
    </div>
  );
}

// N/A + comentario confidencial (VS-019, docs/engines/persistence.md):
// universales a todo tipo de pregunta, sin config nueva en el Builder.
// "Confidencial" es una etiqueta de UI, no control de acceso — ver doc.
function NaCommentRow({
  elementId,
  markedNA,
  comment,
  onAnswerChange,
}: {
  elementId: string;
  markedNA: boolean;
  comment: string;
  onAnswerChange: (key: string, value: AnswerValue) => void;
}) {
  return (
    <div className="runtime-question__na">
      <label className="field--checkbox">
        <input
          type="checkbox"
          checked={markedNA}
          onChange={(e) => onAnswerChange(naKey(elementId), e.target.checked ? "true" : "")}
        />
        No aplica
      </label>
      <label className="field">
        <span className="field__label">Comentario confidencial</span>
        <textarea
          value={comment}
          maxLength={5000}
          rows={2}
          onChange={(e) => onAnswerChange(commentKey(elementId), e.target.value)}
        />
      </label>
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

  // Estado por pregunta (VS-018) + N/A (VS-019) — solo aplica a los tipos de
  // arriba en adelante, que capturan una respuesta manual del evaluado.
  const na = answers[naKey(element.id)] as string | undefined;
  const markedNA = na === "true";
  const answeredOrNA = isAnswered(value, na);
  const derived = deriveStatus(answers[statusKey(element.id)] as string | undefined, answeredOrNA);
  // N/A deshabilita el control principal igual que approved/submitted —
  // son dos motivos independientes para el mismo bloqueo de edición (un
  // elemento puede estar N/A sin estar aprobado/enviado, y viceversa).
  const locked = derived === "approved" || derived === "submitted" || markedNA;
  const canComplete = answeredOrNA && (derived === "not_started" || derived === "in_progress");
  const statusRow = (
    <StatusRow elementId={element.id} derived={derived} canComplete={canComplete} onAnswerChange={onAnswerChange} />
  );
  const naCommentRow = (
    <NaCommentRow
      elementId={element.id}
      markedNA={markedNA}
      comment={(answers[commentKey(element.id)] as string | undefined) ?? ""}
      onAnswerChange={onAnswerChange}
    />
  );

  if (element.type === "url_publica") {
    const urls = Array.isArray(value) && (value.length === 0 || typeof value[0] === "string") ? (value as string[]) : [];
    return (
      <fieldset className="field runtime-question">
        <legend className="field__label">
          {element.label || <em>(sin texto)</em>} {element.required && <Pill variant="warn">obligatorio</Pill>}
        </legend>
        {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}
        <UrlPublicaView element={element} value={urls} onChange={(next) => onChange(next)} locked={locked} />
        {statusRow}
        {naCommentRow}
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
        <EvidenceView
          token={token}
          subindicatorId={subindicatorId}
          element={element}
          value={refs}
          onChange={(next) => onChange(next)}
          locked={locked}
        />
        {statusRow}
        {naCommentRow}
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
          <input
            value={(value as string) ?? ""}
            maxLength={element.maxLength}
            disabled={locked}
            onChange={(e) => onChange(e.target.value)}
          />
        )}

        {element.type === "texto_largo" && (
          <textarea
            value={(value as string) ?? ""}
            maxLength={element.maxLength}
            rows={4}
            disabled={locked}
            onChange={(e) => onChange(e.target.value)}
          />
        )}

        {element.type === "numero" && (
          <input
            type="number"
            value={value === undefined ? "" : (value as number)}
            min={element.min}
            max={element.max}
            disabled={locked}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          />
        )}
        {statusRow}
        {naCommentRow}
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
                <input
                  type="radio"
                  name={element.id}
                  disabled={locked}
                  checked={value === opt.id}
                  onChange={() => onChange(opt.id)}
                />
                {opt.label}
              </label>
              {value === opt.id && opt.subOptions && opt.subOptions.length > 0 && (
                <SubOptionsView
                  subKey={`${element.id}::${opt.id}`}
                  subOptions={opt.subOptions}
                  value={answers[`${element.id}::${opt.id}`]}
                  onChange={(next) => onAnswerChange(`${element.id}::${opt.id}`, next)}
                  locked={locked}
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
                      disabled={locked}
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
                      locked={locked}
                    />
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      {statusRow}
      {naCommentRow}
    </fieldset>
  );
}
