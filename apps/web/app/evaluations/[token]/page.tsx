"use client";
import { DueDateBanner } from "@/components/due-date-banner";

import {
  commentKey,
  componentRegistry,
  deriveStatus,
  dimensionNumber,
  directSubindicatorNumber,
  evaluateExpression,
  evaluateTableExpression,
  hasAnswer,
  indicatorNumber,
  isAnswered,
  isElementVisible,
  naKey,
  questionNumber,
  sanitizeCommentHtml,
  statusKey,
  stripCommentHtml,
  subindicatorNumber,
  unitKey,
  type AnswerValue,
  type Evaluation,
  type EvaluationSnapshot,
  type EvidenceRef,
  type FormElement,
  type ResponseAnswers,
  type TablaDatosConfig,
  type TableValue,
} from "@plataforma-csa/sdk-core";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import CharacterCount from "@tiptap/extension-character-count";
import StarterKit from "@tiptap/starter-kit";
import { api } from "@/lib/api-client";
import { Pill } from "@/components/ui";
import { RichLabel } from "@/components/rich-label";

const COMMENT_MAX_CHARS = 5000;

interface Props {
  params: Promise<{ token: string }>;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

// VS-054 (docs/domain/business-units.md, "Acceso del evaluado"): el Runtime
// autenticado por unidad de negocio (`/evaluations/authenticated/[id]`)
// necesita el mismo árbol/formulario/autosave que este Runtime público — la
// única diferencia real son las 3 URLs de fetch/guardado (evaluación,
// respuestas, PUT de respuesta) y que la evidencia todavía no tiene ruta
// autenticada equivalente (ver guards de `token` más abajo). En vez de
// duplicar ~1700 líneas de render, se extrae ese trío de operaciones a un
// `RuntimeAdapter` que cada página arma con sus propias URLs — `RuntimeCore`
// (exportado) es agnóstico de token/id/sesión.
export interface RuntimeAdapter {
  fetchEvaluation: () => Promise<Evaluation>;
  fetchResponses: () => Promise<Array<{ subindicatorId: string; answers: ResponseAnswers }>>;
  saveResponse: (subindicatorId: string, answers: ResponseAnswers) => Promise<unknown>;
}

type SnapshotSubindicator = EvaluationSnapshot["dimensions"][number]["indicators"][number]["subindicators"][number];
type SnapshotIndicator = EvaluationSnapshot["dimensions"][number]["indicators"][number];
type SnapshotDimension = EvaluationSnapshot["dimensions"][number];

interface FlatSubindicator {
  dimId: string;
  dimTitle: string;
  dimNumber: string;
  // Subindicadores directos (VS-029, docs/domain/evaluation-hierarchy.md):
  // sin Indicador intermedio — indId/indTitle/indNumber ausentes en ese caso.
  indId?: string;
  indTitle?: string;
  indNumber?: string;
  subNumber: string;
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

// VS-021 (docs/domain/evaluation-hierarchy.md, "Numeración automática"):
// número = posición 0-based dentro del array ya ordenado de su nivel.
function flatten(snapshot: EvaluationSnapshot): FlatSubindicator[] {
  const out: FlatSubindicator[] = [];
  snapshot.dimensions.forEach((dim, dimIndex) => {
    dim.indicators.forEach((ind, indIndex) => {
      ind.subindicators.forEach((sub, subIndex) => {
        out.push({
          dimId: dim.id,
          dimTitle: dim.title,
          dimNumber: dimensionNumber(dimIndex),
          indId: ind.id,
          indTitle: ind.title,
          indNumber: indicatorNumber(dimIndex, indIndex),
          subNumber: subindicatorNumber(dimIndex, indIndex, subIndex),
          sub,
        });
      });
    });
    // Subindicadores directos (VS-029): sin Indicador intermedio, numerados
    // después de todos los Indicadores de la Dimensión (ver evaluation.ts).
    dim.subindicators.forEach((sub, subIndex) => {
      out.push({
        dimId: dim.id,
        dimTitle: dim.title,
        dimNumber: dimensionNumber(dimIndex),
        subNumber: directSubindicatorNumber(dimIndex, dim.indicators.length, subIndex),
        sub,
      });
    });
  });
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

// Estado por nodo en el árbol (VS-027, docs/engines/persistence.md):
// agregación derivada, no persistida — mismo criterio que la numeración
// (VS-021). Progreso de un Indicador/Dimensión = suma de answered/total de
// sus descendientes, no un estado nuevo en `packages/db`.
function indicatorProgress(ind: SnapshotIndicator, answersBySub: Record<string, ResponseAnswers>) {
  return ind.subindicators.reduce(
    (acc, sub) => {
      const p = progressOf(sub, answersBySub[sub.id]);
      return { answered: acc.answered + p.answered, total: acc.total + p.total };
    },
    { answered: 0, total: 0 },
  );
}

function dimensionProgress(dim: SnapshotDimension, answersBySub: Record<string, ResponseAnswers>) {
  const fromIndicators = dim.indicators.reduce(
    (acc, ind) => {
      const p = indicatorProgress(ind, answersBySub);
      return { answered: acc.answered + p.answered, total: acc.total + p.total };
    },
    { answered: 0, total: 0 },
  );
  // Subindicadores directos (VS-029) suman al mismo total agregado de la Dimensión.
  return dim.subindicators.reduce((acc, sub) => {
    const p = progressOf(sub, answersBySub[sub.id]);
    return { answered: acc.answered + p.answered, total: acc.total + p.total };
  }, fromIndicators);
}

function progressState(p: { answered: number; total: number }): "" | "neutral" | "accent" | "good" {
  if (p.total === 0) return "";
  if (p.answered === 0) return "neutral";
  if (p.answered === p.total) return "good";
  return "accent";
}

// VS-054: `evidenceToken` sigue siendo el prop que baja a EvidenceView/
// OptionReferencesView (evidencia pública) — `undefined` cuando el llamador
// es el Runtime autenticado, ver guards en esos componentes arriba.
export function RuntimeCore({ adapter, evidenceToken }: { adapter: RuntimeAdapter; evidenceToken: string | undefined }) {
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
    adapter
      .fetchEvaluation()
      .then((ev) => {
        setEvaluation(ev);
        const first = flatten(ev.snapshot)[0];
        setActiveId(first ? first.sub.id : null);
      })
      .catch(() => setNotFound(true));
    adapter
      .fetchResponses()
      .then((responses) => {
        const map: Record<string, ResponseAnswers> = {};
        for (const row of responses) map[row.subindicatorId] = row.answers;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter]);

  const flat = useMemo(() => (evaluation ? flatten(evaluation.snapshot) : []), [evaluation]);
  const activeIndex = flat.findIndex((f) => f.sub.id === activeId);
  const active = activeIndex >= 0 ? flat[activeIndex] : null;
  // VS-057 (docs/domain/business-units.md, "Plazo de recepción"): bloqueo
  // proactivo en el cliente cuando `dueDate` ya venció — antes solo el
  // servidor lo rechazaba (403 al guardar, VS-052); el evaluado podía
  // seguir escribiendo y recién veía el error al intentar guardar. Réplica
  // en UI de la misma regla, no la reemplaza (el servidor sigue siendo la
  // fuente de verdad — este flag solo deshabilita inputs/botones).
  const deadlineLocked = !!evaluation?.dueDate && new Date(evaluation.dueDate) <= new Date();
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
    // Defensa en profundidad: si el debounce de autosave quedó agendado
    // justo antes de que el plazo venza, no dispararlo igual — el servidor
    // lo rechazaría de todos modos (403 EvaluationLockedError, VS-052).
    if (deadlineLocked) return;
    setSaveStatus("saving");
    setSaveError(null);
    try {
      await adapter.saveResponse(subindicatorId, answers);
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
    if (!active || deadlineLocked) return;
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

        {snapshot.dimensions.map((dim, dimIndex) => {
          const dimState = progressState(dimensionProgress(dim, answersBySub));
          return (
            <div key={dim.id} className="runtime-nav__dim">
              <button type="button" className="runtime-nav__toggle" onClick={() => toggleCollapsed(dim.id)}>
                <span className="runtime-nav__caret">{collapsed.has(dim.id) ? "▸" : "▾"}</span>
                <span className={`tree-dot${dimState ? ` tree-dot--${dimState}` : ""}`} />
                {dimensionNumber(dimIndex)} {dim.title}
              </button>

              {!collapsed.has(dim.id) &&
                dim.indicators.map((ind, indIndex) => {
                  const indState = progressState(indicatorProgress(ind, answersBySub));
                  return (
                    <div key={ind.id} className="runtime-nav__ind">
                      <button type="button" className="runtime-nav__toggle" onClick={() => toggleCollapsed(ind.id)}>
                        <span className="runtime-nav__caret">{collapsed.has(ind.id) ? "▸" : "▾"}</span>
                        <span className={`tree-dot${indState ? ` tree-dot--${indState}` : ""}`} />
                        {indicatorNumber(dimIndex, indIndex)} {ind.title}
                      </button>

                      {!collapsed.has(ind.id) &&
                        ind.subindicators.map((sub, subIndex) => {
                          const state = progressState(progressOf(sub, answersBySub[sub.id]));
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              className={`runtime-nav__sub${sub.id === activeId ? " runtime-nav__sub--active" : ""}`}
                              onClick={() => setActiveId(sub.id)}
                            >
                              <span className={`tree-dot${state ? ` tree-dot--${state}` : ""}`} />
                              {subindicatorNumber(dimIndex, indIndex, subIndex)} {sub.title}
                            </button>
                          );
                        })}
                    </div>
                  );
                })}

              {/* Subindicadores directos (VS-029, docs/domain/evaluation-hierarchy.md):
                  sin Indicador intermedio, mismo nivel visual que un Subindicador
                  normal pero sin agrupador de por medio. */}
              {!collapsed.has(dim.id) &&
                dim.subindicators.map((sub, subIndex) => {
                  const state = progressState(progressOf(sub, answersBySub[sub.id]));
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      className={`runtime-nav__sub${sub.id === activeId ? " runtime-nav__sub--active" : ""}`}
                      onClick={() => setActiveId(sub.id)}
                    >
                      <span className={`tree-dot${state ? ` tree-dot--${state}` : ""}`} />
                      {directSubindicatorNumber(dimIndex, dim.indicators.length, subIndex)} {sub.title}
                    </button>
                  );
                })}
            </div>
          );
        })}
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
            <button type="button" className="btn btn--primary btn--sm" onClick={handleSave} disabled={!dirty || deadlineLocked}>
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
          {active.dimNumber} {active.dimTitle}
          {/* Subindicadores directos (VS-029) no tienen Indicador intermedio que mostrar. */}
          {active.indNumber && (
            <>
              {" "}
              › {active.indNumber} {active.indTitle}
            </>
          )}
        </p>
        <h1>
          {active.subNumber} {active.sub.title}
        </h1>
        {active.sub.description && <p>{active.sub.description}</p>}
        <DueDateBanner dueDate={evaluation.dueDate} contactEmail={evaluation.contactEmail} />

        {!active.sub.formSchema || active.sub.formSchema.elements.length === 0 ? (
          <p className="empty">Este formulario todavía no tiene elementos.</p>
        ) : (
          <div className="runtime-elements">
            {(() => {
              // VS-021 (docs/engines/form.md, "Numeración automática de
              // preguntas"): 0.N solo sobre elementos isQuestion, en el orden
              // ya filtrado por visibleIf — reinicia en cada Subindicador.
              const visibleElements = active.sub.formSchema.elements.filter((el) =>
                isElementVisible(el.visibleIf, answersBySub[active.sub.id] ?? {}),
              );
              let qIndex = 0;
              return visibleElements.map((el) => {
                const number = isQuestion(el) ? questionNumber(qIndex++) : undefined;
                return (
                  <ElementView
                    key={el.id}
                    token={evidenceToken}
                    subindicatorId={active.sub.id}
                    element={el}
                    {...(number ? { number } : {})}
                    answers={answersBySub[active.sub.id] ?? {}}
                    value={answersBySub[active.sub.id]?.[el.id]}
                    onChange={(value) => setAnswer(el.id, value)}
                    onAnswerChange={setAnswer}
                    formLocked={deadlineLocked}
                  />
                );
              });
            })()}
          </div>
        )}
      </div>
    </main>
  );
}

// Página pública (ver docs/engines/persistence.md): sin sesión, sin
// requireActiveMember del lado del API. Wrapper delgado sobre RuntimeCore —
// arma el adapter con las 3 URLs públicas por token y pasa el mismo token
// como evidenceToken (evidencia SÍ funciona en este modo).
export default function PublicEvaluationPage({ params }: Props) {
  const { token } = use(params);
  const adapter = useMemo<RuntimeAdapter>(
    () => ({
      fetchEvaluation: () =>
        api.get<{ evaluation: Evaluation }>(`/api/public/evaluations/${token}`).then((res) => res.evaluation),
      fetchResponses: () =>
        api
          .get<{ responses: Array<{ subindicatorId: string; answers: ResponseAnswers }> }>(
            `/api/public/evaluations/${token}/responses`,
          )
          .then((res) => res.responses),
      saveResponse: (subindicatorId, answers) =>
        api.put(`/api/public/evaluations/${token}/responses/${subindicatorId}`, { answers }),
    }),
    [token],
  );
  return <RuntimeCore adapter={adapter} evidenceToken={token} />;
}

interface ElementViewProps {
  // VS-054 (docs/domain/business-units.md, "Acceso del evaluado"): undefined
  // en modo autenticado — evidencia/referencias flexibles con adjunto todavía
  // no tienen ruta autenticada equivalente a la pública (deferido, ver spec),
  // así que esos sub-componentes degradan a un aviso o al modo solo-URL en
  // vez de intentar armar una URL de API inválida.
  token: string | undefined;
  subindicatorId: string;
  element: FormElement;
  // VS-021 (docs/engines/form.md, "Numeración automática de preguntas"):
  // "0.N" ya calculado por el padre (solo preguntas lo reciben).
  number?: string;
  answers: ResponseAnswers;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  // Opciones anidadas (docs/engines/form.md, "Opciones anidadas VS-016"): las
  // sub-opciones marcadas se guardan bajo una clave sintética
  // `${elementId}::${optionId}` en el mismo mapa de answers, no en `value`
  // (que sigue siendo solo la respuesta del elemento padre) — por eso este
  // componente necesita poder escribir claves arbitrarias, no solo la propia.
  onAnswerChange: (key: string, value: AnswerValue) => void;
  // VS-057 (docs/domain/business-units.md, "Plazo de recepción"): true si
  // `evaluation.dueDate` ya venció — se OR-ea con el resto de motivos de
  // bloqueo del elemento (approved/submitted/N/A), no los reemplaza.
  formLocked: boolean;
}

// Campo embebido en una sub-opción (VS-040, docs/engines/form.md "Campos
// embebidos en sub-opciones"): hallazgo del mismo HTML de S&P que VS-039 — la
// sub-opción "% de ingresos cubierto" trae su propio <select>.
type SubOptionField =
  | { type: "seleccion_desplegable"; options: { id: string; label: string }[] }
  | { type: "texto_corto"; maxLength?: number | undefined }
  | { type: "numero"; min?: number | undefined; max?: number | undefined; unit?: string | undefined };

function SubOptionFieldView({
  field,
  value,
  onChange,
  locked,
}: {
  field: SubOptionField;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  locked?: boolean | undefined;
}) {
  if (field.type === "seleccion_desplegable") {
    return (
      <select value={(value as string) ?? ""} disabled={locked} onChange={(e) => onChange(e.target.value)}>
        <option value="">Seleccionar…</option>
        {field.options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {stripCommentHtml(opt.label)}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "texto_corto") {
    return (
      <input value={(value as string) ?? ""} maxLength={field.maxLength} disabled={locked} onChange={(e) => onChange(e.target.value)} />
    );
  }
  return (
    <span className="runtime-question__number-with-unit">
      <input
        type="number"
        value={value === undefined ? "" : (value as number)}
        min={field.min}
        max={field.max}
        disabled={locked}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
      {field.unit && <span className="runtime-question__unit">{field.unit}</span>}
    </span>
  );
}

// Sub-checklist revelado bajo una opción seleccionada que tiene subOptions
// (docs/engines/form.md, "Opciones anidadas VS-016"). Por defecto selección
// múltiple (checkbox) — `exclusive` (VS-040, "Campos embebidos en
// sub-opciones") la vuelve excluyente (radio), solo para el nivel 1 (el
// nivel 2/sub-sub-opciones, llamado recursivamente abajo, siempre queda en
// selección múltiple — sin evidencia de necesitar excluyencia ahí).
function SubOptionsView({
  subKey,
  heading,
  subOptions,
  value,
  onChange,
  locked,
  answers,
  onAnswerChange,
  exclusive = false,
  token,
  subindicatorId,
  elementId,
}: {
  subKey: string;
  // VS-046: encabezado propio, usado por el bloque secundario
  // (`secondaryOptionsHeading`) — el bloque primario (`subOptions`) nunca lo
  // pasa, sin cambio de comportamiento para llamadas existentes.
  heading?: string | undefined;
  subOptions: {
    id: string;
    label: string;
    subOptions?: { id: string; label: string }[] | undefined;
    references?:
      | {
          maxUrls?: number | undefined;
          position?: "before_suboptions" | "after_suboptions" | undefined;
          refType?: "public" | "flexible" | undefined;
        }
      | undefined;
    field?: SubOptionField | undefined;
    // VS-042 (docs/engines/form.md "Tabla dentro de una sub-opción"): mismo
    // shape que el Elemento tabla_datos, reutilizado tal cual — solo nivel 1
    // (subOption), no subSubOption (el tipo del schema lo garantiza).
    table?: TablaDatosConfig | undefined;
  }[];
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  locked?: boolean | undefined;
  answers: ResponseAnswers;
  onAnswerChange: (key: string, value: AnswerValue) => void;
  exclusive?: boolean;
  // VS-045: necesarios para subir documentos internos en referencias
  // flexibles (presign-ref); el sub-checklist recursivo los re-propaga.
  // VS-054: undefined en modo autenticado, ver ElementViewProps.
  token: string | undefined;
  subindicatorId: string;
  elementId: string;
}) {
  const selectedMulti = Array.isArray(value) && typeof value[0] === "string" ? (value as string[]) : [];
  const selectedSingle = typeof value === "string" ? value : undefined;
  const isSelected = (id: string): boolean => (exclusive ? selectedSingle === id : selectedMulti.includes(id));

  return (
    <div className="sub-options runtime-options" key={subKey}>
      {heading && (
        <p className="sub-options__heading">
          <RichLabel html={heading} />
        </p>
      )}
      {subOptions.map((sub) => (
        <div key={sub.id}>
          <label className="field field--checkbox">
            <input
              type={exclusive ? "radio" : "checkbox"}
              name={exclusive ? subKey : undefined}
              disabled={locked}
              checked={isSelected(sub.id)}
              onChange={() =>
                exclusive
                  ? onChange(sub.id)
                  : onChange(isSelected(sub.id) ? selectedMulti.filter((id) => id !== sub.id) : [...selectedMulti, sub.id])
              }
            />
            <RichLabel html={sub.label} />
          </label>
          {isSelected(sub.id) && sub.field && (
            <SubOptionFieldView
              field={sub.field}
              value={answers[`${subKey}::${sub.id}::field`]}
              onChange={(next) => onAnswerChange(`${subKey}::${sub.id}::field`, next)}
              locked={locked}
            />
          )}
          {/* VS-042: tabla embebida — mismo FormTableView que tabla_datos,
              clave sintética `${subKey}::${sub.id}::table` (un nivel más
              adentro que la propia sub-opción) */}
          {isSelected(sub.id) && sub.table && (
            <FormTableView
              label={sub.label}
              unitKeyPrefix={`${subKey}::${sub.id}::table`}
              columns={sub.table.columns}
              rows={sub.table.rows}
              value={answers[`${subKey}::${sub.id}::table`] as TableValue | undefined}
              onChange={(next) => onAnswerChange(`${subKey}::${sub.id}::table`, next)}
              answers={answers}
              onAnswerChange={onAnswerChange}
              locked={locked}
            />
          )}
          {isSelected(sub.id) && sub.references && sub.references.position !== "after_suboptions" && (
            <OptionReferencesView
              refType={sub.references.refType ?? "public"}
              maxUrls={sub.references.maxUrls ?? 3}
              value={answers[`${subKey}::${sub.id}::refs`] as (string | EvidenceRef)[] | undefined}
              onChange={(next) => onAnswerChange(`${subKey}::${sub.id}::refs`, next)}
              locked={locked}
              token={token}
              subindicatorId={subindicatorId}
              elementId={elementId}
            />
          )}
          {isSelected(sub.id) && sub.subOptions && sub.subOptions.length > 0 && (
            <SubOptionsView
              subKey={`${subKey}::${sub.id}`}
              subOptions={sub.subOptions}
              value={answers[`${subKey}::${sub.id}`]}
              onChange={(next) => onAnswerChange(`${subKey}::${sub.id}`, next)}
              locked={locked}
              answers={answers}
              onAnswerChange={onAnswerChange}
              token={token}
              subindicatorId={subindicatorId}
              elementId={elementId}
            />
          )}
          {isSelected(sub.id) && sub.references && sub.references.position === "after_suboptions" && (
            <OptionReferencesView
              refType={sub.references.refType ?? "public"}
              maxUrls={sub.references.maxUrls ?? 3}
              value={answers[`${subKey}::${sub.id}::refs`] as (string | EvidenceRef)[] | undefined}
              onChange={(next) => onAnswerChange(`${subKey}::${sub.id}::refs`, next)}
              locked={locked}
              token={token}
              subindicatorId={subindicatorId}
              elementId={elementId}
            />
          )}
        </div>
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
  // VS-054: undefined en modo autenticado, ver ElementViewProps.
  token: string | undefined;
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

  // VS-054 (docs/domain/business-units.md): sin rutas de evidencia
  // autenticadas todavía (deferido, ver spec "Acceso del evaluado") — se
  // deja el aviso en vez de invocar rutas públicas que no aceptan sesión.
  if (!token) {
    return <p className="empty">Evidencias no disponibles en este modo todavía.</p>;
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
  number,
  answers,
  onChange,
}: {
  element: Extract<FormElement, { type: "calculado" }>;
  number?: string;
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
      <span className="field__label">
        {number && `${number} `}
        {element.label || <em>(sin texto)</em>}
      </span>
      {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}
      <input value={display} disabled readOnly placeholder="(sin calcular)" />
    </label>
  );
}

// Título/contenido separados + estado inicial (VS-037, docs/engines/form.md,
// supersede VS-025): siempre contraíble/expandible por el evaluado — el
// admin solo define con qué estado arranca (startCollapsed). Estado local,
// no persistido — preferencia de lectura de la sesión, mismo criterio que
// `collapsed` del árbol de navegación. `content` es HTML con formato
// (VS-038, mismo motor que el comentario confidencial) — se re-sanitiza acá
// (defensa en profundidad, mismo criterio que la página de Revisión) aunque
// ya se sanitizó al guardar en el Builder.
function BannerView({ element }: { element: Extract<FormElement, { type: "banner" }> }) {
  const [expanded, setExpanded] = useState(!element.startCollapsed);
  return (
    <div className={`runtime-banner runtime-banner--${element.variant}`}>
      <button type="button" className="runtime-banner__toggle" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
        <span className="runtime-banner__caret">{expanded ? "▾" : "▸"}</span>
        <span>{element.label}</span>
      </button>
      {expanded && (
        <div className="runtime-banner__content" dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(element.content) }} />
      )}
    </div>
  );
}

// Elemento `url_publica` (docs/engines/form.md, "Campo URL pública VS-017"):
// hasta maxUrls (default 3) inputs de referencia externa, sin subida de
// archivo. Slots vacíos nunca se persisten (ver doc) — se filtran recién al
// escribir en `answers`, así hasAnswer() no cuenta un slot en blanco como
// respuesta.
//
// Arranca en 1 slot visible, no en maxUrls (ajuste pedido por el usuario
// 2026-08-14 tras revisar VS-039/040 en producción): un botón "Agregar URL"
// explícito revela el siguiente, hasta maxUrls — ya no crece solo al
// escribir en el último slot. Compartido por UrlPublicaView (VS-017) y
// OptionReferencesView (VS-039/040): mismo patrón visual y de datos, solo
// cambia la clave de respuesta que arma el llamador.
function UrlSlotsView({
  maxUrls,
  value,
  onChange,
  locked,
  className,
}: {
  maxUrls: number;
  value: string[] | undefined;
  onChange: (value: string[]) => void;
  locked?: boolean | undefined;
  className: string;
}) {
  const urls = Array.isArray(value) ? value : [];
  const [visibleCount, setVisibleCount] = useState(() => Math.max(urls.length, 1));
  const count = Math.min(visibleCount, maxUrls);
  const slots = Array.from({ length: count }, (_, i) => urls[i] ?? "");

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
    setVisibleCount((c) => Math.max(c - 1, 1));
  }

  function addSlot() {
    setVisibleCount((c) => Math.min(c + 1, maxUrls));
  }

  return (
    <div className={className}>
      {slots.map((url, index) => (
        <div key={index} className="option-row">
          <input type="url" value={url} disabled={locked} placeholder="https://..." onChange={(e) => updateSlot(index, e.target.value)} />
          {!locked && slots.length > 1 && (
            <button type="button" className="btn btn--danger btn--sm" onClick={() => removeSlot(index)}>
              Quitar
            </button>
          )}
        </div>
      ))}
      {!locked && slots.length < maxUrls && (
        <button type="button" className="btn btn--secondary btn--sm" onClick={addSlot}>
          Agregar URL
        </button>
      )}
    </div>
  );
}

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
  return (
    <UrlSlotsView maxUrls={element.maxUrls ?? 3} value={value} onChange={onChange} locked={locked} className="runtime-url-list" />
  );
}

// Referencias por opción (VS-039, docs/engines/form.md "Referencias de URL
// por opción"): mismo patrón de slots que UrlPublicaView arriba, clave de
// respuesta `${elementId}::${optionId}::refs` en vez de un Elemento propio —
// se renderiza debajo de la opción seleccionada.
//
// VS-045 ("Referencias flexibles"): `refType` decide el contenido de los
// slots — "public" conserva el comportamiento VS-039/040 (solo URLs, sin
// subida de archivo); "flexible" deja elegir por slot entre URL pública y
// documento interno (adjunto a R2, mismo patrón de presigned upload que
// `evidencia` — ver docs/engines/evidences.md). Un slot vacío de tipo
// documento se representa como `null` en el estado local y nunca se
// persiste: el commit filtra vacíos, así hasAnswer() no cuenta un slot en
// blanco como respuesta (mismo criterio que UrlSlotsView).
function isDocRef(slot: string | EvidenceRef | null | undefined): slot is EvidenceRef {
  return typeof slot === "object" && slot !== null;
}

function OptionReferencesView({
  refType,
  maxUrls,
  value,
  onChange,
  locked,
  token,
  subindicatorId,
  elementId,
}: {
  refType: "public" | "flexible";
  maxUrls: number;
  value: (string | EvidenceRef)[] | undefined;
  onChange: (value: (string | EvidenceRef)[]) => void;
  locked?: boolean | undefined;
  // VS-054: undefined en modo autenticado, ver ElementViewProps.
  token: string | undefined;
  subindicatorId: string;
  elementId: string;
}) {
  const slots = Array.isArray(value) ? value : [];

  // refType public: solo URLs (VS-039/040) — un array heredado que traiga
  // refs de documento se filtra al render (nunca se guardaron con refType
  // public, pero defensa en profundidad ante datos inconsistentes).
  // VS-054: sin token (modo autenticado) degrada "flexible" a solo-URL —
  // el adjunto de documento interno necesita las rutas de evidencia
  // autenticadas, todavía no construidas (deferido, ver spec).
  if (refType !== "flexible" || !token) {
    const urls = slots.filter((s): s is string => typeof s === "string");
    return (
      <UrlSlotsView
        maxUrls={maxUrls}
        value={urls}
        onChange={(next) => onChange([...next])}
        locked={locked}
        className="runtime-url-list sub-options"
      />
    );
  }

  // refType flexible: un mini-select por slot (URL pública / Documento
  // interno) + upload de adjunto a R2 para los slots de documento.
  const [visibleCount, setVisibleCount] = useState(() => Math.max(slots.length, 1));
  const [uploading, setUploading] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // El kind elegido de un slot vacío no se puede derivar del slot (null
  // puede ser "URL aún sin texto" o "documento aún sin subir") — se guarda
  // por índice aquí y se sincroniza en cada mutación de localSlots.
  const [pendingKinds, setPendingKinds] = useState<("url" | "doc")[]>(() =>
    Array.from({ length: Math.min(Math.max(slots.length, 1), maxUrls) }, (_, i) => (isDocRef(slots[i]) ? "doc" : "url")),
  );
  const count = Math.min(visibleCount, maxUrls);
  const localSlots: (string | EvidenceRef | null)[] = Array.from(
    { length: count },
    (_, i) => slots[i] ?? null,
  );
  const kindOf = (index: number): "url" | "doc" => {
    const slot = localSlots[index];
    if (isDocRef(slot)) return "doc";
    if (typeof slot === "string") return "url";
    return pendingKinds[index] ?? "url";
  };

  function commit(nextSlots: (string | EvidenceRef | null)[]) {
    onChange(
      nextSlots.filter((s): s is string | EvidenceRef =>
        typeof s === "string" ? s.trim() !== "" : s !== null,
      ),
    );
  }

  function updateSlot(index: number, next: string | EvidenceRef | null) {
    const nextSlots = [...localSlots];
    nextSlots[index] = next;
    commit(nextSlots);
  }

  function removeSlot(index: number) {
    const current = localSlots[index];
    if (isDocRef(current)) {
      // El binario ya no pertenece a la Respuesta: borrarlo de R2
      // (idempotente — ver DELETE /evidences). El fallo no bloquea la
      // remoción local; el objeto huérfano se limpia con la Evaluación.
      void api.del(`/api/public/evaluations/${token}/evidences`, { key: current.key }).catch(() => {});
    }
    commit(localSlots.filter((_, i) => i !== index));
    setPendingKinds((prev) => prev.filter((_, i) => i !== index));
    setVisibleCount((c) => Math.max(c - 1, 1));
  }

  function changeKind(index: number, kind: "url" | "doc") {
    // Cambiar el tipo vacía el slot (una URL no es un documento y
    // viceversa); un slot doc previo borra su binario de R2.
    const current = localSlots[index];
    if (isDocRef(current)) {
      void api.del(`/api/public/evaluations/${token}/evidences`, { key: current.key }).catch(() => {});
    }
    setPendingKinds((prev) => prev.map((k, i) => (i === index ? kind : k)));
    updateSlot(index, kind === "doc" ? null : "");
  }

  async function handleDocFile(index: number, file: File) {
    setUploadError(null);
    if (file.size > 10 * 1024 * 1024) {
      setUploadError(`${file.name} supera el máximo de 10 MB`);
      return;
    }
    setUploading(index);
    try {
      const { key, url } = await api.post<{ key: string; url: string }>(
        `/api/public/evaluations/${token}/evidences/presign-ref`,
        {
          subindicatorId,
          elementId,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
        },
      );
      const putRes = await fetch(url, { method: "PUT", body: file });
      if (!putRes.ok) throw new Error(`Upload HTTP_${putRes.status}`);
      updateSlot(index, { key, name: file.name, size: file.size, mimeType: file.type || "application/octet-stream" });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "No se pudo subir el archivo");
    } finally {
      setUploading(null);
    }
  }

  async function downloadDoc(ref: EvidenceRef) {
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
    <div className="runtime-url-list sub-options">
      {localSlots.map((slot, index) => {
        const isDoc = kindOf(index) === "doc";
        return (
          <div key={index} className="option-row">
            <select
              className="option-row__kind"
              value={kindOf(index)}
              disabled={locked}
              onChange={(e) => changeKind(index, e.target.value as "url" | "doc")}
            >
              <option value="url">URL pública</option>
              <option value="doc">Documento interno</option>
            </select>
            {isDoc ? (
              <span className="runtime-evidence">
                {!locked && (
                  <input
                    type="file"
                    disabled={uploading !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleDocFile(index, file);
                      e.target.value = "";
                    }}
                  />
                )}
                {isDocRef(slot) ? (
                  <>
                    {slot.name} ({(slot.size / 1024).toFixed(0)} KB)
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => void downloadDoc(slot)}>
                      Ver
                    </button>
                  </>
                ) : (
                  <em>Selecciona un archivo para adjuntarlo como documento interno.</em>
                )}
              </span>
            ) : (
              <input
                type="url"
                value={typeof slot === "string" ? slot : ""}
                disabled={locked}
                placeholder="https://..."
                onChange={(e) => updateSlot(index, e.target.value)}
              />
            )}
            {!locked && count > 1 && (
              <button type="button" className="btn btn--danger btn--sm" onClick={() => removeSlot(index)}>
                Quitar
              </button>
            )}
          </div>
        );
      })}
      {!locked && count < maxUrls && (
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => setVisibleCount((c) => Math.min(c + 1, maxUrls))}>
          Agregar referencia
        </button>
      )}
      {uploading !== null && <p className="runtime-evidence__uploading">Subiendo…</p>}
      {uploadError && (
        <p className="runtime-evidence__error" role="alert">
          {uploadError}
        </p>
      )}
    </div>
  );
}

// Tabla de datos (VS-024, docs/engines/form.md "Tabla de datos"): <table>
// real, celdas leídas/escritas en el mapa anidado rowId->columnId->valor
// (onChange reconstruye el objeto completo, mismo patrón inmutable que el
// resto del Runtime). Unidad por fila (si availableUnits) via unitKey con id
// compuesto `${unitKeyPrefix}::${row.id}` — una unidad por fila, no por
// celda. Reutilizada por la tabla embebida de una sub-opción (VS-042): el
// Elemento pasa unitKeyPrefix = element.id; la sub-opción pasa
// `${subKey}::${sub.id}::table` (clave sintética de la respuesta).
// Tipos del schema exportados desde sdk-core (FormTableColumn/FormTableRow/
// TablaDatosConfig): instancia única compartida entre FormTableView y la
// tabla embebida de una sub-opción — los Extract duplican la identidad de los
// tipos recursivos y TypeScript los declara "unrelated" (TS2719).
type FormTableColumns = TablaDatosConfig["columns"];
type FormTableRows = TablaDatosConfig["rows"];

// Alias nombrado de los props (no type literal inline en la firma): TS
// re-instancia los type literals de los props en cada call site y la
// identidad de los tipos del schema cambia de una comparación a otra
// (TS2719 "unrelated"), aunque sean estructuralmente idénticos.
type FormTableViewProps = {
  label: string;
  unitKeyPrefix: string;
  columns: FormTableColumns;
  rows: FormTableRows;
  value: TableValue | undefined;
  answers: ResponseAnswers;
  onChange: (value: TableValue) => void;
  onAnswerChange: (key: string, value: AnswerValue) => void;
  locked?: boolean | undefined;
};

// VS-047 (docs/engines/form.md "Editor de tabla_datos estilo grilla"):
// celda cellType "calculado" — mismo patrón que CalculadoView (arriba),
// encapsulado aparte porque useEffect no puede vivir condicionalmente
// dentro del .map de columnas de FormTableView.
function TableCalculatedCell({
  rowId,
  columnId,
  expression,
  table,
  onChange,
}: {
  rowId: string;
  columnId: string;
  expression: string | undefined;
  table: TableValue;
  onChange: (rowId: string, columnId: string, value: number) => void;
}) {
  const valuesByRow: Record<string, Record<string, number | undefined>> = {};
  for (const [r, rowVals] of Object.entries(table)) {
    const numRow: Record<string, number | undefined> = {};
    for (const [c, v] of Object.entries(rowVals)) {
      if (typeof v === "number") numRow[c] = v;
    }
    valuesByRow[r] = numRow;
  }
  const computed = expression ? evaluateTableExpression(expression, columnId, valuesByRow) : undefined;

  useEffect(() => {
    if (computed !== undefined && table[rowId]?.[columnId] !== computed) {
      onChange(rowId, columnId, computed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computed]);

  const display = computed === undefined ? "" : String(Number(computed.toFixed(2)));
  return <input value={display} disabled readOnly placeholder="(sin calcular)" />;
}

function FormTableView({
  label,
  unitKeyPrefix,
  columns,
  rows,
  value,
  answers,
  onChange,
  onAnswerChange,
  locked,
}: FormTableViewProps) {
  const table = value ?? {};

  function updateCell(rowId: string, columnId: string, cell: string | number) {
    onChange({ ...table, [rowId]: { ...(table[rowId] ?? {}), [columnId]: cell } });
  }

  return (
    <table className="runtime-table">
      <caption className="sr-only">{stripCommentHtml(label)}</caption>
      <tbody>
        {rows.map((row) => {
          const rowValue = table[row.id] ?? {};
          return (
            <tr key={row.id}>
              {columns.map((col) => {
                // VS-048 (docs/engines/form.md "Grilla uniforme sin
                // encabezados especiales"): sin fallback a un "tipo de fila
                // legacy" — el tipo/config de CUALQUIER celda, incluida la
                // esquina superior izquierda, vive siempre en row.cells. Sin
                // entrada para esta columna = celda en blanco (grillas
                // irregulares).
                const cellCfg = row.cells.find((c) => c.columnId === col.id);
                if (!cellCfg) {
                  return <td key={col.id} className="runtime-table__blank" />;
                }
                const { cellType, editable, content, expression, maxLength: cellMaxLength, options: cellOptions, unit, availableUnits } = cellCfg;
                const cell = rowValue[col.id];
                // "calculado" siempre se evalúa dinámicamente sin importar
                // `editable` — es de solo lectura por naturaleza (VS-047,
                // bug real: el check `!editable` antes de este la ocultaba
                // y la mostraba como contenido fijo estático vacío).
                if (cellType === "calculado") {
                  return (
                    <td key={col.id}>
                      <TableCalculatedCell
                        rowId={row.id}
                        columnId={col.id}
                        expression={expression}
                        table={table}
                        onChange={(r, c, v) => updateCell(r, c, v)}
                      />
                    </td>
                  );
                }
                if (editable === false) {
                  return (
                    <td key={col.id}>
                      <RichLabel html={content ?? ""} />
                    </td>
                  );
                }
                if (cellType === "seleccion_desplegable") {
                  return (
                    <td key={col.id}>
                      <select
                        value={(cell as string) ?? ""}
                        disabled={locked}
                        onChange={(e) => updateCell(row.id, col.id, e.target.value)}
                      >
                        <option value="">Seleccionar…</option>
                        {(cellOptions ?? []).map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {stripCommentHtml(opt.label)}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                }
                if (cellType === "numero") {
                  // VS-048: unidad por CELDA (antes era por fila) — clave
                  // sintética un nivel más específica (`::row::col`), activa
                  // el selector que existía en el schema desde VS-044 pero
                  // nunca se había conectado a Runtime.
                  const cellUnitKey = unitKey(`${unitKeyPrefix}::${row.id}::${col.id}`);
                  const cellUnit = availableUnits ? ((answers[cellUnitKey] as string | undefined) ?? availableUnits[0]) : undefined;
                  return (
                    <td key={col.id}>
                      <input
                        type="number"
                        value={cell === undefined ? "" : (cell as number)}
                        disabled={locked}
                        onChange={(e) => updateCell(row.id, col.id, e.target.value === "" ? "" : Number(e.target.value))}
                      />
                      {availableUnits && availableUnits.length > 0 && (
                        <select value={cellUnit} disabled={locked} onChange={(e) => onAnswerChange(cellUnitKey, e.target.value)}>
                          {availableUnits.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      )}
                      {!availableUnits && unit && <span className="runtime-question__unit"> ({unit})</span>}
                    </td>
                  );
                }
                return (
                  <td key={col.id}>
                    <input
                      value={(cell as string) ?? ""}
                      maxLength={cellMaxLength}
                      disabled={locked}
                      onChange={(e) => updateCell(row.id, col.id, e.target.value)}
                    />
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
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
// Comentario confidencial con formato (VS-030, docs/adr/0006, sucesor de
// VS-028/markdown-lite, ver docs/engines/form.md): editor WYSIWYG real
// (TipTap/ProseMirror, contentEditable) en vez del <textarea> con sintaxis
// manual. `commentKey` sigue guardando `string` — ahora HTML sanitizado
// (`sanitizeCommentHtml`) en vez de markdown-lite. StarterKit reducido a
// solo negrita/itálica/lista/párrafo (mismo alcance mínimo que antes), más
// CharacterCount para el límite de 5000 caracteres (antes `maxLength` del
// textarea nativo).
function NaCommentRow({
  elementId,
  markedNA,
  comment,
  locked,
  onAnswerChange,
}: {
  elementId: string;
  markedNA: boolean;
  comment: string;
  locked: boolean;
  onAnswerChange: (key: string, value: AnswerValue) => void;
}) {
  const editor = useEditor({
    // Next.js App Router hace SSR del árbol — evita el mismatch de hidratación
    // documentado por TipTap para editores que no deben renderizar en el server.
    immediatelyRender: false,
    editable: !locked,
    content: comment,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        strike: false,
        orderedList: false,
      }),
      CharacterCount.configure({ limit: COMMENT_MAX_CHARS }),
    ],
    editorProps: {
      attributes: {
        "aria-label": "Comentario confidencial",
        class: "comment-editor__content",
      },
    },
    onUpdate: ({ editor: e }) => {
      onAnswerChange(commentKey(elementId), sanitizeCommentHtml(e.getHTML()));
    },
  });

  // Sincroniza el editor cuando `comment` cambia por una razón EXTERNA al
  // propio editor (Cancel/Reset restaura una foto anterior, VS-020) — no en
  // cada tecleo: `onUpdate` ya escribió `comment` de vuelta con el mismo HTML
  // que `editor.getHTML()`, así que la comparación evita un loop de reset
  // que le comería el cursor al evaluado mientras escribe.
  useEffect(() => {
    if (!editor) return;
    if (comment !== editor.getHTML()) {
      editor.commands.setContent(comment || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, comment]);

  useEffect(() => {
    editor?.setEditable(!locked);
  }, [editor, locked]);

  const chars = editor?.storage.characterCount.characters() ?? comment.length;

  return (
    <div className="runtime-question__na">
      <label className="field field--checkbox">
        <input
          type="checkbox"
          checked={markedNA}
          onChange={(e) => onAnswerChange(naKey(elementId), e.target.checked ? "true" : "")}
        />
        No aplica
      </label>
      <div className="field">
        <span className="field__label">Comentario confidencial</span>
        <div className="rich-toolbar" role="toolbar" aria-label="Formato del comentario">
          {/* onMouseDown={preventDefault} en los 3 botones: sin esto, el mousedown
              del botón le roba el foco/selección al contentEditable ANTES de que
              corra el onClick, y ProseMirror pierde de dónde partir — patrón
              documentado de TipTap para toolbars fuera del editor. */}
          <button
            type="button"
            aria-pressed={editor?.isActive("bold") ?? false}
            disabled={locked}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleBold().run()}
            aria-label="Negrita"
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            aria-pressed={editor?.isActive("italic") ?? false}
            disabled={locked}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            aria-label="Itálica"
          >
            <em>I</em>
          </button>
          <button
            type="button"
            aria-pressed={editor?.isActive("bulletList") ?? false}
            disabled={locked}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            aria-label="Lista"
          >
            •
          </button>
        </div>
        {/* onClick={preventDefault}: NaCommentRow vive dentro del <label
            className="field runtime-question"> de la pregunta (texto_corto/
            numero/etc.) o del <fieldset> (seleccion_unica/múltiple) — un
            <label> redirige el foco a su control asociado (el input/textarea
            principal de la pregunta) en CUALQUIER click dentro de él, salvo
            que el target ya sea un elemento de formulario nativo que
            intercepta su propio click (input/textarea/select). Un div
            contentEditable NO es un elemento de formulario nativo, así que
            sin este preventDefault el navegador le robaba el foco al editor
            justo después de mousedown+focus (bug real, reproducido en
            producción, no solo en tests — ver git blame de esta línea).
            No rompe la escritura: ProseMirror ya maneja su propia selección
            en mousedown, antes de que el evento click llegue aquí. */}
        <EditorContent editor={editor} className="comment-editor" onClick={(e) => e.preventDefault()} />
        <span className="comment-editor__count" aria-live="polite">
          {chars}/{COMMENT_MAX_CHARS}
        </span>
      </div>
    </div>
  );
}

function ElementView({ token, subindicatorId, element, number, answers, value, onChange, onAnswerChange, formLocked }: ElementViewProps) {
  if (element.type === "instruccion") {
    return (
      <p className="runtime-instruction">
        <RichLabel html={element.label} />
      </p>
    );
  }

  if (element.type === "banner") {
    return <BannerView element={element} />;
  }

  if (element.type === "calculado") {
    return (
      <CalculadoView element={element} {...(number ? { number } : {})} answers={answers} onChange={(next) => onChange(next)} />
    );
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
  // VS-057: `formLocked` (plazo vencido) es un cuarto motivo, independiente
  // de los otros tres.
  const locked = formLocked || derived === "approved" || derived === "submitted" || markedNA;
  // VS-057: "Marcar como completo" también queda oculto con el plazo
  // vencido — es otra forma de editar el estado de la respuesta.
  const canComplete = !formLocked && answeredOrNA && (derived === "not_started" || derived === "in_progress");
  const statusRow = (
    <StatusRow elementId={element.id} derived={derived} canComplete={canComplete} onAnswerChange={onAnswerChange} />
  );
  const naCommentRow = (
    <NaCommentRow
      elementId={element.id}
      markedNA={markedNA}
      comment={(answers[commentKey(element.id)] as string | undefined) ?? ""}
      locked={locked}
      onAnswerChange={onAnswerChange}
    />
  );

  if (element.type === "url_publica") {
    const urls = Array.isArray(value) && (value.length === 0 || typeof value[0] === "string") ? (value as string[]) : [];
    return (
      <fieldset className="field runtime-question">
        <legend className="field__label">
          {number && `${number} `}
          <RichLabel html={element.label} fallback={<em>(sin texto)</em>} /> {element.required && <Pill variant="warn">obligatorio</Pill>}
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
          {number && `${number} `}
          <RichLabel html={element.label} fallback={<em>(sin texto)</em>} /> {element.required && <Pill variant="warn">obligatorio</Pill>}
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

  if (element.type === "tabla_datos") {
    const table = value && typeof value === "object" && !Array.isArray(value) ? (value as TableValue) : undefined;
    return (
      <fieldset className="field runtime-question">
        <legend className="field__label">
          {number && `${number} `}
          <RichLabel html={element.label} fallback={<em>(sin texto)</em>} /> {element.required && <Pill variant="warn">obligatorio</Pill>}
        </legend>
        {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}
<FormTableView
          label={element.label}
          unitKeyPrefix={element.id}
          columns={element.columns}
          rows={element.rows}
          value={table}
          answers={answers}
          onChange={onChange}
          onAnswerChange={onAnswerChange}
          locked={locked}
        />
        {statusRow}
        {naCommentRow}
      </fieldset>
    );
  }

  // seleccion_desplegable: un solo control -> <label> (mismo grupo que
  // texto_corto/texto_largo/numero: respuesta = un valor simple, no un
  // grupo de controles como seleccion_unica/seleccion_multiple). El <label>
  // envuelve SOLO su propio control — no naCommentRow/statusRow (VS-030): un
  // <label> redirige el foco/activación a su control asociado ante CUALQUIER
  // click dentro de él salvo que el target ya sea otro control de formulario
  // nativo (input/textarea/select/button); un contentEditable no lo es, así
  // que el editor WYSIWYG del comentario perdía el foco si vivía dentro de
  // este mismo <label>. Wrapper exterior pasa de <label> a <div> con la
  // misma clase (`.field`/`.runtime-question` son selectores de clase, no
  // dependen del tag — ver globals.css) para no romper el layout.
  if (element.type === "seleccion_desplegable") {
    return (
      <div className="field runtime-question">
        <label className="field">
          <span className="field__label">
            {number && `${number} `}
            <RichLabel html={element.label} fallback={<em>(sin texto)</em>} /> {element.required && <Pill variant="warn">obligatorio</Pill>}
          </span>
          {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}
          <select value={(value as string) ?? ""} disabled={locked} onChange={(e) => onChange(e.target.value)}>
            <option value="">Seleccionar…</option>
            {element.options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                <RichLabel html={opt.label} />
              </option>
            ))}
          </select>
        </label>
        {statusRow}
        {naCommentRow}
      </div>
    );
  }

  // texto_corto/texto_largo/numero: un solo control -> <label> (asocia el
  // nombre accesible directo al input, ver docs/architecture/accessibility.md).
  // El <label> envuelve SOLO el input/textarea/número — ver nota de
  // seleccion_desplegable arriba sobre por qué naCommentRow/statusRow viven
  // fuera de él (VS-030).
  if (element.type === "texto_corto" || element.type === "texto_largo" || element.type === "numero") {
    return (
      <div className="field runtime-question">
        <label className="field">
          <span className="field__label">
            {number && `${number} `}
            <RichLabel html={element.label} fallback={<em>(sin texto)</em>} /> {element.required && <Pill variant="warn">obligatorio</Pill>}
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
            <span className="runtime-question__number-with-unit">
              <input
                type="number"
                value={value === undefined ? "" : (value as number)}
                min={element.min}
                max={element.max}
                disabled={locked}
                onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
              />
              {element.availableUnits && element.availableUnits.length > 0 ? (
                <select
                  value={(answers[unitKey(element.id)] as string | undefined) ?? element.availableUnits[0]}
                  disabled={locked}
                  onChange={(e) => onAnswerChange(unitKey(element.id), e.target.value)}
                >
                  {element.availableUnits.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              ) : (
                element.unit && <span className="runtime-question__unit">{element.unit}</span>
              )}
            </span>
          )}
        </label>
        {statusRow}
        {naCommentRow}
      </div>
    );
  }

  // seleccion_unica/seleccion_multiple: grupo de varios controles -> <fieldset>
  // + <legend> nombra el grupo; cada opción ya tiene su propio <label>.
  return (
    <fieldset className="field runtime-question">
      <legend className="field__label">
        {number && `${number} `}
          <RichLabel html={element.label} fallback={<em>(sin texto)</em>} /> {element.required && <Pill variant="warn">obligatorio</Pill>}
      </legend>
      {element.helpText && <span className="runtime-question__help">{element.helpText}</span>}

      {(element.type === "seleccion_unica" || element.type === "seleccion_multiple") &&
        element.references && (
          <OptionReferencesView
            refType={element.references.refType ?? "public"}
            maxUrls={element.references.maxUrls ?? 3}
            value={answers[`${element.id}::refs`] as (string | EvidenceRef)[] | undefined}
            onChange={(next) => onAnswerChange(`${element.id}::refs`, next)}
            locked={locked}
            token={token}
            subindicatorId={subindicatorId}
            elementId={element.id}
          />
        )}

      {element.type === "seleccion_unica" && (
        <div className="runtime-options">
          {element.options.map((opt) => (
            <div key={opt.id} className="option-row-group">
              <label className="field field--checkbox">
                <input
                  type="radio"
                  name={element.id}
                  disabled={locked}
                  checked={value === opt.id}
                  onChange={() => onChange(opt.id)}
                />
                <RichLabel html={opt.label} />
              </label>
              {value === opt.id && opt.references && opt.references.position !== "after_suboptions" && (
                <OptionReferencesView
                  refType={opt.references.refType ?? "public"}
                  maxUrls={opt.references.maxUrls ?? 3}
                  value={answers[`${element.id}::${opt.id}::refs`] as (string | EvidenceRef)[] | undefined}
                  onChange={(next) => onAnswerChange(`${element.id}::${opt.id}::refs`, next)}
                  locked={locked}
                  token={token}
                  subindicatorId={subindicatorId}
                  elementId={element.id}
                />
              )}
              {value === opt.id && opt.subOptions && opt.subOptions.length > 0 && (
                <SubOptionsView
                  subKey={`${element.id}::${opt.id}`}
                  subOptions={opt.subOptions}
                  value={answers[`${element.id}::${opt.id}`]}
                  onChange={(next) => onAnswerChange(`${element.id}::${opt.id}`, next)}
                  locked={locked}
                  answers={answers}
                  onAnswerChange={onAnswerChange}
                  exclusive={opt.subOptionsExclusive ?? false}
                  token={token}
                  subindicatorId={subindicatorId}
                  elementId={element.id}
                />
              )}
              {value === opt.id && opt.secondaryOptions && opt.secondaryOptions.length > 0 && (
                <SubOptionsView
                  subKey={`${element.id}::${opt.id}::secondary`}
                  heading={opt.secondaryOptionsHeading}
                  subOptions={opt.secondaryOptions}
                  value={answers[`${element.id}::${opt.id}::secondary`]}
                  onChange={(next) => onAnswerChange(`${element.id}::${opt.id}::secondary`, next)}
                  locked={locked}
                  answers={answers}
                  onAnswerChange={onAnswerChange}
                  exclusive={opt.secondaryOptionsExclusive ?? false}
                  token={token}
                  subindicatorId={subindicatorId}
                  elementId={element.id}
                />
              )}
              {value === opt.id && opt.references && opt.references.position === "after_suboptions" && (
                <OptionReferencesView
                  refType={opt.references.refType ?? "public"}
                  maxUrls={opt.references.maxUrls ?? 3}
                  value={answers[`${element.id}::${opt.id}::refs`] as (string | EvidenceRef)[] | undefined}
                  onChange={(next) => onAnswerChange(`${element.id}::${opt.id}::refs`, next)}
                  locked={locked}
                  token={token}
                  subindicatorId={subindicatorId}
                  elementId={element.id}
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
                  <label className="field field--checkbox">
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={selected.includes(opt.id)}
                      onChange={(e) =>
                        onChange(e.target.checked ? [...selected, opt.id] : selected.filter((id) => id !== opt.id))
                      }
                    />
                    <RichLabel html={opt.label} />
                  </label>
                  {selected.includes(opt.id) && opt.references && opt.references.position !== "after_suboptions" && (
                    <OptionReferencesView
                      refType={opt.references.refType ?? "public"}
                      maxUrls={opt.references.maxUrls ?? 3}
                      value={answers[`${element.id}::${opt.id}::refs`] as (string | EvidenceRef)[] | undefined}
                      onChange={(next) => onAnswerChange(`${element.id}::${opt.id}::refs`, next)}
                      locked={locked}
                      token={token}
                      subindicatorId={subindicatorId}
                      elementId={element.id}
                    />
                  )}
                  {selected.includes(opt.id) && opt.subOptions && opt.subOptions.length > 0 && (
                    <SubOptionsView
                      subKey={`${element.id}::${opt.id}`}
                      subOptions={opt.subOptions}
                      value={answers[`${element.id}::${opt.id}`]}
                      onChange={(next) => onAnswerChange(`${element.id}::${opt.id}`, next)}
                      locked={locked}
                      answers={answers}
                      onAnswerChange={onAnswerChange}
                      exclusive={opt.subOptionsExclusive ?? false}
                      token={token}
                      subindicatorId={subindicatorId}
                      elementId={element.id}
                    />
                  )}
                  {selected.includes(opt.id) && opt.secondaryOptions && opt.secondaryOptions.length > 0 && (
                    <SubOptionsView
                      subKey={`${element.id}::${opt.id}::secondary`}
                      heading={opt.secondaryOptionsHeading}
                      subOptions={opt.secondaryOptions}
                      value={answers[`${element.id}::${opt.id}::secondary`]}
                      onChange={(next) => onAnswerChange(`${element.id}::${opt.id}::secondary`, next)}
                      locked={locked}
                      answers={answers}
                      onAnswerChange={onAnswerChange}
                      exclusive={opt.secondaryOptionsExclusive ?? false}
                      token={token}
                      subindicatorId={subindicatorId}
                      elementId={element.id}
                    />
                  )}
                  {selected.includes(opt.id) && opt.references && opt.references.position === "after_suboptions" && (
                    <OptionReferencesView
                      refType={opt.references.refType ?? "public"}
                      maxUrls={opt.references.maxUrls ?? 3}
                      value={answers[`${element.id}::${opt.id}::refs`] as (string | EvidenceRef)[] | undefined}
                      onChange={(next) => onAnswerChange(`${element.id}::${opt.id}::refs`, next)}
                      locked={locked}
                      token={token}
                      subindicatorId={subindicatorId}
                      elementId={element.id}
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
