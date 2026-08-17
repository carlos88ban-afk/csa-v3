import { randomUUID } from "node:crypto";
import type { ElementStatus, ResponseAnswers } from "@plataforma-csa/sdk-core";
import { statusKey } from "@plataforma-csa/sdk-core";
import type { EvaluationSnapshot } from "@plataforma-csa/sdk-core";
import { and, eq } from "drizzle-orm";
import { db } from "../client.js";
import { evaluation } from "../schema/evaluation.js";
import { response } from "../schema/response.js";
import { EvaluationLockedError, NotFoundError } from "./service.js";

// Motor engine/persistence v1 (ver docs/engines/persistence.md). Sin
// `organizationId`: el acceso a estas funciones ya fue resuelto vía token en
// la capa de API (mismo criterio que getEvaluationByToken en
// evaluation-service.ts) — la Respuesta se ata a la Evaluación, no a una
// sesión ni a una identidad de evaluado.
//
// VS-051 (docs/domain/business-units.md, "Aislamiento de progreso entre
// unidades"): el parámetro `businessUnitOrganizationId` es OPcional — si no
// se pasa, el service la completa automáticamente con
// `evaluation.organizationId` (la organización dueña). Así el flujo público
// existente (sin unidades de negocio) no cambia: sus filas siempre quedan en
// la columna con el valor de la org dueña, y el unique de 3 columnas
// deduplica exactamente como el de 2 de antes. La validación de que una
// unidad esté realmente asignada (`evaluation_assignment`) vive en el
// endpoint autenticado nuevo (ver "Acceso del evaluado" en el spec), no acá —
// este service sigue siendo agnóstico de sesión (mismo criterio que hoy: la
// Respuesta se ata a la Evaluación, no a una identidad).

// Subindicadores directos bajo Dimensión (VS-029, docs/domain/evaluation-hierarchy.md):
// bug real encontrado en producción durante la verificación de este slice
// — esta función no miraba dim.subindicators (directos), así que guardar
// una respuesta de un Subindicador directo fallaba con subindicator_NOT_FOUND.
function snapshotHasSubindicator(snapshot: EvaluationSnapshot, subindicatorId: string): boolean {
  return snapshot.dimensions.some(
    (dim) =>
      dim.indicators.some((ind) => ind.subindicators.some((sub) => sub.id === subindicatorId)) ||
      dim.subindicators.some((sub) => sub.id === subindicatorId),
  );
}

async function resolveBusinessUnitOrganizationId(evaluationId: string, businessUnitOrganizationId?: string) {
  if (businessUnitOrganizationId) return businessUnitOrganizationId;
  const [ev] = await db
    .select({ organizationId: evaluation.organizationId })
    .from(evaluation)
    .where(eq(evaluation.id, evaluationId));
  if (!ev) throw new NotFoundError("evaluation");
  return ev.organizationId;
}

export async function upsertResponse(
  evaluationId: string,
  subindicatorId: string,
  answers: ResponseAnswers,
  businessUnitOrganizationId?: string,
) {
  const [ev] = await db.select().from(evaluation).where(eq(evaluation.id, evaluationId));
  if (!ev) throw new NotFoundError("evaluation");

  // VS-052 (docs/domain/business-units.md, "Plazo de recepción (dueDate) y
  // comportamiento del banner"): bloqueo de servidor, no solo de UI — pasado
  // dueDate ya no se registra ni edita NINGUNA respuesta (tampoco estados de
  // elementos vía setElementStatus, que delega en esta función). La lectura
  // (listResponses/getResponse) queda SIEMPRE permitida, también vencido el
  // plazo. El 403 lo traduce toErrorResponse en la capa de API.
  if (ev.dueDate && Date.now() >= ev.dueDate.getTime()) {
    throw new EvaluationLockedError();
  }

  const snapshot = ev.snapshot as EvaluationSnapshot;
  if (!snapshotHasSubindicator(snapshot, subindicatorId)) throw new NotFoundError("subindicator");

  const unit = businessUnitOrganizationId ?? ev.organizationId;
  const [row] = await db
    .insert(response)
    .values({ id: randomUUID(), evaluationId, subindicatorId, businessUnitOrganizationId: unit, answers })
    .onConflictDoUpdate({
      target: [response.evaluationId, response.subindicatorId, response.businessUnitOrganizationId],
      set: { answers, updatedAt: new Date() },
    })
    .returning();
  if (!row) throw new Error("Failed to upsert response");
  return row;
}

// Lista todas las respuestas de la Evaluación (sin unidad) — comportamiento
// histórico, usado por el export CSV actual y el listado autenticado del
// owner. Con `businessUnitOrganizationId` filtra por unidad (progreso por
// unidad, ver spec). La matriz puede listar todas las filas sin el filtro
// (excepción cross-unidad del spec); la ruta de la unidad pasa su
// `session.activeOrganizationId` siempre.
export async function listResponses(evaluationId: string, businessUnitOrganizationId?: string) {
  if (businessUnitOrganizationId) {
    return db
      .select()
      .from(response)
      .where(
        and(
          eq(response.evaluationId, evaluationId),
          eq(response.businessUnitOrganizationId, businessUnitOrganizationId),
        ),
      );
  }
  return db.select().from(response).where(eq(response.evaluationId, evaluationId));
}

// VS-018 (ver docs/engines/persistence.md, "Estado por pregunta"). No existía
// un lookup de una sola fila — solo listResponses (todas). Lo necesita la
// ruta pública para tener el `current` que exige
// assertPublicResponseUpdateAllowed, y setElementStatus para mergear sobre
// los answers existentes sin pisarlos.
export async function getResponse(
  evaluationId: string,
  subindicatorId: string,
  businessUnitOrganizationId?: string,
) {
  const unit = await resolveBusinessUnitOrganizationId(evaluationId, businessUnitOrganizationId);
  const [row] = await db
    .select()
    .from(response)
    .where(
      and(
        eq(response.evaluationId, evaluationId),
        eq(response.subindicatorId, subindicatorId),
        eq(response.businessUnitOrganizationId, unit),
      ),
    );
  return row ?? null;
}

// Solo la llama la ruta autenticada (owner/editor, ya de confianza vía
// requireWriteAccess) — sin el resguardo de assertPublicResponseUpdateAllowed,
// que es exclusivo del lado público sin sesión.
export async function setElementStatus(
  evaluationId: string,
  subindicatorId: string,
  elementId: string,
  status: ElementStatus | null,
  businessUnitOrganizationId?: string,
) {
  const current = await getResponse(evaluationId, subindicatorId, businessUnitOrganizationId);
  const answers: ResponseAnswers = { ...(current?.answers as ResponseAnswers | undefined) };
  const key = statusKey(elementId);
  if (status === null) {
    delete answers[key];
  } else {
    answers[key] = status;
  }
  return upsertResponse(evaluationId, subindicatorId, answers, businessUnitOrganizationId);
}
