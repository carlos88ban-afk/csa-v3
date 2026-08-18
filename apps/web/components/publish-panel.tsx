"use client";

// VS-054/055/059 (docs/domain/business-units.md, "Panel Publicar" +
// "Dashboard de avance corporativo" + "Filtrado de preguntas por unidad"):
// reemplaza la pantalla /frameworks/[frameworkId] (eliminada) —
// Publicación completa (generar/listar/revocar Evaluaciones, plazo/
// contacto, asignación de unidades de negocio, progreso por unidad, export
// XLSX consolidado, exclusiones por Subindicador/elemento) vive ahora en
// un panel del Builder.

import { useEffect, useState } from "react";
import type { Evaluation, EvaluationAssignment } from "@plataforma-csa/sdk-core";
import { api } from "@/lib/api-client";
import { Button, Pill } from "@/components/ui";
import { ExclusionEditor } from "@/components/exclusion-editor";

interface ChildOrganization {
  id: string;
  name: string;
}

interface UnitProgress {
  businessUnitOrganizationId: string;
  name: string;
  total: number;
  answered: number;
  percent: number;
}

function toDateInputValue(dueDate: unknown): string {
  if (!dueDate || typeof dueDate !== "string") return "";
  return dueDate.slice(0, 10);
}

function EvaluationRow({
  evaluation,
  frameworkId,
  childOrgs,
  onRevoke,
}: {
  evaluation: Evaluation;
  frameworkId: string;
  childOrgs: ChildOrganization[];
  onRevoke: (id: string) => void;
}) {
  const [assignments, setAssignments] = useState<EvaluationAssignment[] | null>(null);
  const [progress, setProgress] = useState<UnitProgress[] | null>(null);
  const [dueDate, setDueDate] = useState(toDateInputValue(evaluation.dueDate));
  const [contactEmail, setContactEmail] = useState(evaluation.contactEmail ?? "");
  const [savingDeadline, setSavingDeadline] = useState(false);
  const [deadlineError, setDeadlineError] = useState<string | null>(null);
  const [deadlineSaved, setDeadlineSaved] = useState(false);
  const [assignBusy, setAssignBusy] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  // VS-059: qué unidad tiene su editor de exclusiones abierto — a lo sumo
  // una por vez por Evaluación, alcanza para no complicar el estado.
  const [exclusionsOpenFor, setExclusionsOpenFor] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ assignments: EvaluationAssignment[] }>(`/api/evaluations/${evaluation.id}/assignments`)
      .then((res) => setAssignments(res.assignments))
      .catch(() => setAssignments([]));
  }, [evaluation.id]);

  // Dashboard de progreso (VS-055): solo tiene sentido pedirlo si hay al
  // menos una unidad asignada — recién se sabe eso después de que
  // `assignments` resuelve. Se refetchea con la longitud de assignments
  // (no la referencia, que cambia en cada asignar/desasignar) para no
  // perder la actualización cuando el admin marca/desmarca un checkbox.
  useEffect(() => {
    if (!assignments || assignments.length === 0) {
      setProgress(null);
      return;
    }
    api
      .get<{ units: UnitProgress[] }>(`/api/evaluations/${evaluation.id}/progress`)
      .then((res) => setProgress(res.units))
      .catch(() => setProgress(null));
  }, [evaluation.id, assignments?.length]);

  const deadlinePassed = !!evaluation.dueDate && new Date(evaluation.dueDate) <= new Date();

  // dueDate solo se envía si el admin escribió algo — el service rechaza
  // (400 dueDate_CANNOT_CLEAR) intentar volver a null un plazo ya fijado, y
  // dejar el campo vacío en este form no debe interpretarse como esa
  // intención (ver docs/domain/business-units.md, "Plazo de recepción").
  async function handleSaveDeadline() {
    setSavingDeadline(true);
    setDeadlineError(null);
    setDeadlineSaved(false);
    try {
      const body: { dueDate?: string; contactEmail: string | null } = {
        contactEmail: contactEmail.trim() === "" ? null : contactEmail.trim(),
      };
      if (dueDate.trim() !== "") body.dueDate = dueDate;
      await api.patch(`/api/evaluations/${evaluation.id}`, body);
      setDeadlineSaved(true);
    } catch (err) {
      setDeadlineError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSavingDeadline(false);
    }
  }

  async function toggleAssignment(org: ChildOrganization) {
    if (!assignments) return;
    const existing = assignments.find((a) => a.businessUnitOrganizationId === org.id);
    setAssignBusy(org.id);
    try {
      if (existing) {
        await api.del(`/api/evaluations/${evaluation.id}/assignments/${existing.id}`);
        setAssignments((prev) => (prev ?? []).filter((a) => a.id !== existing.id));
      } else {
        const { assignment } = await api.post<{ assignment: EvaluationAssignment }>(
          `/api/evaluations/${evaluation.id}/assignments`,
          { businessUnitOrganizationId: org.id },
        );
        setAssignments((prev) => [...(prev ?? []), assignment]);
      }
    } catch {
      // Estado real no cambió — el checkbox vuelve solo en el próximo render.
    } finally {
      setAssignBusy(null);
    }
  }

  async function handleRevoke() {
    setRevoking(true);
    try {
      await api.del(`/api/evaluations/${evaluation.id}`);
      onRevoke(evaluation.id);
    } finally {
      setRevoking(false);
    }
  }

  const hasAssignments = (assignments?.length ?? 0) > 0;

  return (
    <li className="entry-list__row publish-panel__row">
      <div className="entry-list__main">
        <Pill variant="good">Publicada</Pill>
        {hasAssignments ? (
          <span className="empty">Modo corporativo — sin enlace público</span>
        ) : (
          <a href={`/evaluations/${evaluation.token}`}>{`/evaluations/${evaluation.token}`}</a>
        )}
      </div>
      <div className="entry-list__actions">
        <a href={`/frameworks/${frameworkId}/evaluations/${evaluation.id}/review`}>Revisar</a>
        {hasAssignments ? (
          <a href={`/api/evaluations/${evaluation.id}/export-xlsx`}>Exportar XLSX consolidado</a>
        ) : (
          <a href={`/api/evaluations/${evaluation.id}/export`}>Exportar CSV</a>
        )}
        <Button type="button" variant="danger" size="sm" onClick={() => void handleRevoke()} disabled={revoking}>
          {revoking ? "Revocando..." : "Revocar"}
        </Button>
      </div>

      <div className="form form--row publish-panel__deadline">
        <label className="field">
          <span className="field__label">Fecha límite</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Correo de contacto</span>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="admin@empresa.com"
          />
        </label>
        <Button type="button" size="sm" onClick={() => void handleSaveDeadline()} disabled={savingDeadline}>
          {savingDeadline ? "Guardando..." : "Guardar plazo"}
        </Button>
        {deadlineSaved && <Pill variant="good">Guardado</Pill>}
      </div>
      {deadlineError && (
        <p className="alert" role="alert">
          {deadlineError}
        </p>
      )}

      {childOrgs.length > 0 && (
        <div className="publish-panel__units">
          <span className="field__label">Unidades de negocio</span>
          {assignments === null ? (
            <p className="empty">Cargando…</p>
          ) : (
            <ul className="publish-panel__unit-list">
              {childOrgs.map((org) => {
                const assignment = assignments.find((a) => a.businessUnitOrganizationId === org.id);
                const assigned = !!assignment;
                const unitProgress = progress?.find((p) => p.businessUnitOrganizationId === org.id);
                const exclusionsOpen = assignment && exclusionsOpenFor === assignment.id;
                return (
                  <li key={org.id}>
                    <label className="field field--checkbox">
                      <input
                        type="checkbox"
                        checked={assigned}
                        disabled={assignBusy === org.id}
                        onChange={() => void toggleAssignment(org)}
                      />
                      {org.name}
                    </label>
                    {/* Dashboard de avance (VS-055, docs/domain/business-units.md
                        "Dashboard de avance corporativo"): progreso por unidad
                        + si el plazo (compartido por toda la Evaluación) venció. */}
                    {assigned && unitProgress && (
                      <span className="publish-panel__unit-progress">
                        <Pill variant={unitProgress.percent === 100 ? "good" : "accent"}>
                          {unitProgress.percent}% ({unitProgress.answered}/{unitProgress.total})
                        </Pill>
                        {deadlinePassed && <Pill variant="warn">Plazo vencido</Pill>}
                      </span>
                    )}
                    {/* VS-059: editor de exclusiones — solo tiene sentido para
                        una unidad ya asignada (necesita un assignmentId real). */}
                    {assignment && (
                      <button
                        type="button"
                        className="exclusion-editor__toggle"
                        onClick={() => setExclusionsOpenFor(exclusionsOpen ? null : assignment.id)}
                      >
                        {exclusionsOpen ? "▾" : "▸"} Exclusiones
                      </button>
                    )}
                    {exclusionsOpen && assignment && (
                      <ExclusionEditor evaluationId={evaluation.id} assignmentId={assignment.id} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export function PublishPanel({
  frameworkId,
  open,
  onClose,
}: {
  frameworkId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [evaluations, setEvaluations] = useState<Evaluation[] | null>(null);
  const [childOrgs, setChildOrgs] = useState<ChildOrganization[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api
      .get<{ evaluations: Evaluation[] }>(`/api/evaluations?frameworkId=${frameworkId}`)
      .then((res) => setEvaluations(res.evaluations));
    api
      .get<{ organizations: ChildOrganization[] }>("/api/organizations/children")
      .then((res) => setChildOrgs(res.organizations))
      .catch(() => setChildOrgs([]));
  }, [open, frameworkId]);

  async function handlePublish() {
    setPublishError(null);
    setPublishing(true);
    try {
      const { evaluation } = await api.post<{ evaluation: Evaluation }>("/api/evaluations", { frameworkId });
      setEvaluations((prev) => [...(prev ?? []), evaluation]);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "No se pudo publicar");
    } finally {
      setPublishing(false);
    }
  }

  function handleRevoked(id: string) {
    setEvaluations((prev) => (prev ?? []).filter((e) => e.id !== id));
  }

  if (!open) return null;

  return (
    <>
      <div className="form-preview-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="form-preview-drawer" role="dialog" aria-modal="true" aria-label="Publicar">
        <div className="form-preview-drawer__head">
          <h3>Publicar</h3>
          <button type="button" className="form-preview-drawer__close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="form-preview publish-panel">
          <Button type="button" variant="primary" onClick={() => void handlePublish()} disabled={publishing}>
            {publishing ? "Publicando..." : "Publicar nueva evaluación"}
          </Button>
          {publishError && (
            <p className="alert" role="alert">
              {publishError}
            </p>
          )}

          {evaluations === null ? (
            <p className="empty">Cargando…</p>
          ) : evaluations.length === 0 ? (
            <p className="empty">Todavía no se publicó ninguna evaluación.</p>
          ) : (
            <ul className="entry-list">
              {evaluations.map((ev) => (
                <EvaluationRow
                  key={ev.id}
                  evaluation={ev}
                  frameworkId={frameworkId}
                  childOrgs={childOrgs}
                  onRevoke={handleRevoked}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
