import { randomUUID } from "node:crypto";
import type { ResponseAnswers } from "@plataforma-csa/sdk-core";
import type { EvaluationSnapshot } from "@plataforma-csa/sdk-core";
import { eq } from "drizzle-orm";
import { db } from "../client.js";
import { evaluation } from "../schema/evaluation.js";
import { response } from "../schema/response.js";
import { NotFoundError } from "./service.js";

// Motor engine/persistence v1 (ver docs/engines/persistence.md). Sin
// `organizationId`: el acceso a estas funciones ya fue resuelto vía token en
// la capa de API (mismo criterio que getEvaluationByToken en
// evaluation-service.ts) — la Respuesta se ata a la Evaluación, no a una
// sesión ni a una identidad de evaluado.

function snapshotHasSubindicator(snapshot: EvaluationSnapshot, subindicatorId: string): boolean {
  return snapshot.dimensions.some((dim) =>
    dim.indicators.some((ind) => ind.subindicators.some((sub) => sub.id === subindicatorId)),
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
