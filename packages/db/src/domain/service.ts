import { randomUUID } from "node:crypto";
import type {
  CreateDimensionInput,
  CreateFrameworkInput,
  CreateIndicatorInput,
  CreateSubindicatorInput,
  UpdateDimensionInput,
  UpdateFrameworkInput,
  UpdateIndicatorInput,
} from "@plataforma-csa/sdk-core";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../client.js";
import { dimension, framework, indicator, subindicator } from "../schema/domain.js";

export class NotFoundError extends Error {
  constructor(entity: string) {
    super(`${entity}_NOT_FOUND`);
    this.name = "NotFoundError";
  }
}

// Un INSERT con .returning() de un solo `values(...)` siempre produce
// exactamente una fila si no lanza — esto lo hace explícito para el tipo.
function firstOrThrow<T>(rows: T[], entity: string): T {
  const [row] = rows;
  if (!row) throw new Error(`Failed to insert ${entity}`);
  return row;
}

// --- Framework -------------------------------------------------------------

export async function createFramework(organizationId: string, input: CreateFrameworkInput) {
  const rows = await db
    .insert(framework)
    .values({ id: randomUUID(), organizationId, name: input.name, description: input.description ?? null })
    .returning();
  return firstOrThrow(rows, "framework");
}

export async function getFramework(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(framework)
    .where(and(eq(framework.id, id), eq(framework.organizationId, organizationId)));
  return row ?? null;
}

export async function listFrameworks(organizationId: string) {
  return db.select().from(framework).where(eq(framework.organizationId, organizationId));
}

export async function updateFramework(organizationId: string, id: string, input: UpdateFrameworkInput) {
  const [row] = await db
    .update(framework)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    })
    .where(and(eq(framework.id, id), eq(framework.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

export async function deleteFramework(organizationId: string, id: string) {
  const [row] = await db
    .delete(framework)
    .where(and(eq(framework.id, id), eq(framework.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

// --- Dimension ---------------------------------------------------------------

export async function createDimension(organizationId: string, input: CreateDimensionInput) {
  const parent = await getFramework(organizationId, input.frameworkId);
  if (!parent) throw new NotFoundError("framework");

  const rows = await db
    .insert(dimension)
    .values({
      id: randomUUID(),
      organizationId,
      frameworkId: input.frameworkId,
      title: input.title,
      description: input.description ?? null,
    })
    .returning();
  return firstOrThrow(rows, "dimension");
}

export async function getDimension(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(dimension)
    .where(and(eq(dimension.id, id), eq(dimension.organizationId, organizationId)));
  return row ?? null;
}

export async function listDimensions(organizationId: string, frameworkId: string) {
  return db
    .select()
    .from(dimension)
    .where(and(eq(dimension.frameworkId, frameworkId), eq(dimension.organizationId, organizationId)));
}

export async function updateDimension(organizationId: string, id: string, input: UpdateDimensionInput) {
  const [row] = await db
    .update(dimension)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    })
    .where(and(eq(dimension.id, id), eq(dimension.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

export async function deleteDimension(organizationId: string, id: string) {
  const [row] = await db
    .delete(dimension)
    .where(and(eq(dimension.id, id), eq(dimension.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

// --- Indicator -----------------------------------------------------------

export async function createIndicator(organizationId: string, input: CreateIndicatorInput) {
  const parent = await getDimension(organizationId, input.dimensionId);
  if (!parent) throw new NotFoundError("dimension");

  const rows = await db
    .insert(indicator)
    .values({
      id: randomUUID(),
      organizationId,
      dimensionId: input.dimensionId,
      title: input.title,
      description: input.description ?? null,
    })
    .returning();
  return firstOrThrow(rows, "indicator");
}

export async function getIndicator(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(indicator)
    .where(and(eq(indicator.id, id), eq(indicator.organizationId, organizationId)));
  return row ?? null;
}

export async function listIndicators(organizationId: string, dimensionId: string) {
  return db
    .select()
    .from(indicator)
    .where(and(eq(indicator.dimensionId, dimensionId), eq(indicator.organizationId, organizationId)));
}

export async function updateIndicator(organizationId: string, id: string, input: UpdateIndicatorInput) {
  const [row] = await db
    .update(indicator)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    })
    .where(and(eq(indicator.id, id), eq(indicator.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

export async function deleteIndicator(organizationId: string, id: string) {
  const [row] = await db
    .delete(indicator)
    .where(and(eq(indicator.id, id), eq(indicator.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

// --- Subindicator ----------------------------------------------------------
// `formSchema` no se expone en la API pública todavía (motor de formularios
// es M4), pero el servicio ya soporta actualizarlo y versionar la revisión
// para que VS-007 no tenga que rediseñar esta capa — ver evaluation-hierarchy.md.

// Subindicadores directos bajo Dimensión (VS-029, docs/domain/evaluation-hierarchy.md):
// indicatorId/dimensionId son alternativos — createSubindicatorInput (sdk-core)
// ya valida XOR, acá solo queda validar tenant-scoping del padre que vino.
export async function createSubindicator(organizationId: string, input: CreateSubindicatorInput) {
  if (input.indicatorId) {
    const parent = await getIndicator(organizationId, input.indicatorId);
    if (!parent) throw new NotFoundError("indicator");
  } else if (input.dimensionId) {
    const parent = await getDimension(organizationId, input.dimensionId);
    if (!parent) throw new NotFoundError("dimension");
  }

  const rows = await db
    .insert(subindicator)
    .values({
      id: randomUUID(),
      organizationId,
      indicatorId: input.indicatorId ?? null,
      dimensionId: input.dimensionId ?? null,
      title: input.title,
      description: input.description ?? null,
    })
    .returning();
  return firstOrThrow(rows, "subindicator");
}

export async function getSubindicator(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(subindicator)
    .where(and(eq(subindicator.id, id), eq(subindicator.organizationId, organizationId)));
  return row ?? null;
}

export async function listSubindicators(organizationId: string, indicatorId: string) {
  return db
    .select()
    .from(subindicator)
    .where(and(eq(subindicator.indicatorId, indicatorId), eq(subindicator.organizationId, organizationId)));
}

// Subindicadores directos bajo Dimensión (VS-029) — misma forma que
// listSubindicators, filtra por dimensionId en vez de indicatorId.
export async function listDirectSubindicators(organizationId: string, dimensionId: string) {
  return db
    .select()
    .from(subindicator)
    .where(and(eq(subindicator.dimensionId, dimensionId), eq(subindicator.organizationId, organizationId)));
}

export interface UpdateSubindicatorServiceInput {
  title?: string | undefined;
  description?: string | undefined;
  formSchema?: unknown;
}

export async function updateSubindicator(
  organizationId: string,
  id: string,
  input: UpdateSubindicatorServiceInput,
) {
  const bumpRevision = "formSchema" in input;
  const [row] = await db
    .update(subindicator)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(bumpRevision
        ? { formSchema: input.formSchema, revisionNumber: sql`${subindicator.revisionNumber} + 1` }
        : {}),
    })
    .where(and(eq(subindicator.id, id), eq(subindicator.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

export async function deleteSubindicator(organizationId: string, id: string) {
  const [row] = await db
    .delete(subindicator)
    .where(and(eq(subindicator.id, id), eq(subindicator.organizationId, organizationId)))
    .returning();
  return row ?? null;
}
