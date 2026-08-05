import { randomBytes, randomUUID } from "node:crypto";
import type { CreateEvaluationInput, EvaluationSnapshot } from "@plataforma-csa/sdk-core";
import { and, eq } from "drizzle-orm";
import { db } from "../client.js";
import { dimension, indicator, subindicator } from "../schema/domain.js";
import { evaluation } from "../schema/evaluation.js";
import { getFramework, NotFoundError } from "./service.js";

// Motor engine/publishing v1 (ver docs/engines/publishing.md). El snapshot
// es una copia completa del árbol tomada al publicar — por eso este archivo
// lee framework/dimension/indicator/subindicator directamente (no reutiliza
// list* de service.ts más que para el recorrido de alto nivel), y por eso
// getEvaluationByToken es la única función del dominio sin `organizationId`:
// la seguridad depende del token, no de una sesión.

async function buildSnapshot(
  organizationId: string,
  frameworkId: string,
): Promise<{ frameworkName: string; snapshot: EvaluationSnapshot }> {
  const fw = await getFramework(organizationId, frameworkId);
  if (!fw) throw new NotFoundError("framework");

  const dimensions = await db
    .select()
    .from(dimension)
    .where(and(eq(dimension.frameworkId, frameworkId), eq(dimension.organizationId, organizationId)));

  const snapshotDimensions = await Promise.all(
    dimensions.map(async (dim) => {
      const indicators = await db
        .select()
        .from(indicator)
        .where(and(eq(indicator.dimensionId, dim.id), eq(indicator.organizationId, organizationId)));

      const snapshotIndicators = await Promise.all(
        indicators.map(async (ind) => {
          const subindicators = await db
            .select()
            .from(subindicator)
            .where(and(eq(subindicator.indicatorId, ind.id), eq(subindicator.organizationId, organizationId)));

          return {
            id: ind.id,
            title: ind.title,
            description: ind.description,
            subindicators: subindicators.map((sub) => ({
              id: sub.id,
              title: sub.title,
              description: sub.description,
              formSchema: sub.formSchema as EvaluationSnapshot["dimensions"][number]["indicators"][number]["subindicators"][number]["formSchema"],
              revisionNumber: sub.revisionNumber,
            })),
          };
        }),
      );

      return { id: dim.id, title: dim.title, description: dim.description, indicators: snapshotIndicators };
    }),
  );

  return {
    frameworkName: fw.name,
    snapshot: {
      frameworkName: fw.name,
      frameworkDescription: fw.description,
      dimensions: snapshotDimensions,
    },
  };
}

export async function createEvaluation(organizationId: string, input: CreateEvaluationInput) {
  const { frameworkName, snapshot } = await buildSnapshot(organizationId, input.frameworkId);

  const token = randomBytes(24).toString("base64url");
  const rows = await db
    .insert(evaluation)
    .values({
      id: randomUUID(),
      organizationId,
      frameworkId: input.frameworkId,
      token,
      title: frameworkName,
      snapshot,
    })
    .returning();
  const [row] = rows;
  if (!row) throw new Error("Failed to insert evaluation");
  return row;
}

export async function listEvaluations(organizationId: string, frameworkId: string) {
  return db
    .select()
    .from(evaluation)
    .where(and(eq(evaluation.frameworkId, frameworkId), eq(evaluation.organizationId, organizationId)));
}

export async function deleteEvaluation(organizationId: string, id: string) {
  const [row] = await db
    .delete(evaluation)
    .where(and(eq(evaluation.id, id), eq(evaluation.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

export async function getEvaluationByToken(token: string) {
  const [row] = await db.select().from(evaluation).where(eq(evaluation.token, token));
  return row ?? null;
}
