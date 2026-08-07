import { randomUUID } from "node:crypto";
import type { ElementStatus, ResponseAnswers } from "@plataforma-csa/sdk-core";
import { statusKey } from "@plataforma-csa/sdk-core";
import type { EvaluationSnapshot } from "@plataforma-csa/sdk-core";
import { and, eq } from "drizzle-orm";
import { db } from "../client.js";
import { evaluation } from "../schema/evaluation.js";
import { response } from "../schema/response.js";
import { NotFoundError } from "./service.js";

// Motor engine/persistence v1 (ver docs/engines/persistence.md). Sin
// `organizationId`: el acceso a estas funciones ya fue resuelto vía token en
// la capa de API (mismo criterio que getEvaluationByToken en
// evaluation-service.ts) — la Respuesta se ata a la Evaluación, no a una
// sesión ni a una identidad de evaluado.

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

export async function upsertResponse(evaluationId: string, subindicatorId: string, answers: ResponseAnswers) {
  const [ev] = await db.select().from(evaluation).where(eq(evaluation.id, evaluationId));
  if (!ev) throw new NotFoundError("evaluation");

  const snapshot = ev.snapshot as EvaluationSnapshot;
  if (!snapshotHasSubindicator(snapshot, subindicatorId)) throw new NotFoundError("subindicator");

  const [row] = await db
    .insert(response)
    .values({ id: randomUUID(), evaluationId, subindicatorId, answers })
    .onConflictDoUpdate({
      target: [response.evaluationId, response.subindicatorId],
      set: { answers, updatedAt: new Date() },
    })
    .returning();
  if (!row) throw new Error("Failed to upsert response");
  return row;
}

export async function listResponses(evaluationId: string) {
  return db.select().from(response).where(eq(response.evaluationId, evaluationId));
}

// VS-018 (ver docs/engines/persistence.md, "Estado por pregunta"). No existía
// un lookup de una sola fila — solo listResponses (todas). Lo necesita la
// ruta pública para tener el `current` que exige
// assertPublicResponseUpdateAllowed, y setElementStatus para mergear sobre
// los answers existentes sin pisarlos.
export async function getResponse(evaluationId: string, subindicatorId: string) {
  const [row] = await db
    .select()
    .from(response)
    .where(and(eq(response.evaluationId, evaluationId), eq(response.subindicatorId, subindicatorId)));
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
) {
  const current = await getResponse(evaluationId, subindicatorId);
  const answers: ResponseAnswers = { ...(current?.answers as ResponseAnswers | undefined) };
  const key = statusKey(elementId);
  if (status === null) {
    delete answers[key];
  } else {
    answers[key] = status;
  }
  return upsertResponse(evaluationId, subindicatorId, answers);
}
