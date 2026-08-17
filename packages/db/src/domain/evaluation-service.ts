import { randomBytes, randomUUID } from "node:crypto";
import type { CreateEvaluationInput, EvaluationSnapshot, UpdateEvaluationInput } from "@plataforma-csa/sdk-core";
import { and, eq } from "drizzle-orm";
import { db } from "../client.js";
import { dimension, indicator, subindicator } from "../schema/domain.js";
import { evaluation } from "../schema/evaluation.js";
import { getFramework, NotFoundError, ValidationError } from "./service.js";

// Motor engine/publishing v1 (ver docs/engines/publishing.md). El snapshot
// es una copia completa del árbol tomada al publicar — por eso este archivo
// lee framework/dimension/indicator/subindicator directamente (no reutiliza
// list* de service.ts más que para el recorrido de alto nivel), y por eso
// getEvaluationByToken es la única función del dominio sin `organizationId`:
// la seguridad depende del token, no de una sesión.

type SnapshotSubindicator = EvaluationSnapshot["dimensions"][number]["indicators"][number]["subindicators"][number];

function toSnapshotSubindicator(sub: typeof subindicator.$inferSelect): SnapshotSubindicator {
  return {
    id: sub.id,
    title: sub.title,
    description: sub.description,
    formSchema: sub.formSchema as SnapshotSubindicator["formSchema"],
    revisionNumber: sub.revisionNumber,
  };
}

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
            subindicators: subindicators.map(toSnapshotSubindicator),
          };
        }),
      );

      // Subindicadores directos (VS-029, docs/domain/evaluation-hierarchy.md):
      // sin Indicador intermedio — cuarta query por Dimensión, análoga a la
      // de Indicador→Subindicador de arriba.
      const directSubindicators = await db
        .select()
        .from(subindicator)
        .where(and(eq(subindicator.dimensionId, dim.id), eq(subindicator.organizationId, organizationId)));

      return {
        id: dim.id,
        title: dim.title,
        description: dim.description,
        indicators: snapshotIndicators,
        subindicators: directSubindicators.map(toSnapshotSubindicator),
      };
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
      // VS-052 — el panel Publicar puede fijar el plazo y el correo de
      // contacto al momento de publicar. En creación no se validan reglas de
      // negocio adicionales: un plazo ya vencido solo deja la Evaluación en
      // su estado de reposo natural (bloqueada), no rompe nada.
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
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

export async function getEvaluation(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(evaluation)
    .where(and(eq(evaluation.id, id), eq(evaluation.organizationId, organizationId)));
  return row ?? null;
}

// VS-052 (docs/domain/business-units.md, "Plazo de recepción (dueDate) y
// comportamiento del banner"): única acción administrativa sobre el plazo,
// desde el panel Publicar.
//
// Reglas derivadas de la spec (el formulario nunca queda sin fecha límite
// una vez que se cumplió el plazo):
// - `dueDate: null` SOLO es válido si la Evaluación nunca tuvo plazo — una
//   vez fijado, nunca se limpia de vuelta a `null` (400 dueDate_CANNOT_CLEAR).
// - Toda fijación (primera vez o extensión) debe ser una fecha futura —
//   400 dueDate_MUST_BE_FUTURE. Extender vuelve a habilitar la escritura
//   inmediatamente: el estado del bloqueo se deriva de comparar now contra
//   dueDate en cada request, no hay estado intermedio que recordar.
// - `contactEmail` es libremente editable/limpiable (null).
// Devuelve null si la Evaluación no existe o pertenece a otra organización
// (tenant-scoping, mismo criterio que getEvaluation).
export async function updateEvaluation(organizationId: string, id: string, input: UpdateEvaluationInput) {
  const current = await getEvaluation(organizationId, id);
  if (!current) return null;

  if (input.dueDate !== undefined) {
    if (input.dueDate === null && current.dueDate !== null) {
      throw new ValidationError("dueDate_CANNOT_CLEAR");
    }
    if (input.dueDate !== null && input.dueDate.getTime() <= Date.now()) {
      throw new ValidationError("dueDate_MUST_BE_FUTURE");
    }
  }

  const [row] = await db
    .update(evaluation)
    .set({
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
    })
    .where(and(eq(evaluation.id, id), eq(evaluation.organizationId, organizationId)))
    .returning();
  return row ?? null;
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
