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
import { and, asc, eq, sql } from "drizzle-orm";
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

// dimensionCount (VS-034, docs/architecture/design-system.md "Layout"): join +
// COUNT(DISTINCT ...) porque el join multiplica filas por dimensión — un
// count(dimension.id) sin DISTINCT quedaría inflado si un framework tuviera
// más de una fila unida por otra razón en el futuro.
export async function listFrameworks(organizationId: string) {
  return db
    .select({
      id: framework.id,
      organizationId: framework.organizationId,
      name: framework.name,
      description: framework.description,
      createdAt: framework.createdAt,
      updatedAt: framework.updatedAt,
      dimensionCount: sql<number>`count(distinct ${dimension.id})::int`,
    })
    .from(framework)
    .leftJoin(dimension, eq(dimension.frameworkId, framework.id))
    .where(eq(framework.organizationId, organizationId))
    .groupBy(framework.id);
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

  // VS-049: una Dimensión nueva siempre va al final (mismo criterio "+" al
  // final de la lista que el resto del Builder, VS-047/048).
  const [maxRow] = await db
    .select({ max: sql<number | null>`max(${dimension.order})` })
    .from(dimension)
    .where(eq(dimension.frameworkId, input.frameworkId));
  const order = (maxRow?.max ?? -1) + 1;

  const rows = await db
    .insert(dimension)
    .values({
      id: randomUUID(),
      organizationId,
      frameworkId: input.frameworkId,
      title: input.title,
      description: input.description ?? null,
      order,
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

// indicatorCount/directSubindicatorCount (VS-035, docs/architecture/design-system.md
// "Layout"): DOS leftJoin a la vez multiplican filas entre sí (una dimensión con
// 2 indicadores y 3 subs directos produciría 6 filas unidas) — cada count()
// debe ser DISTINCT de forma independiente por columna, o el conteo queda
// inflado por el fan-out del otro join. No se suman en SQL: quedan separados
// porque son datos independientes (un indicador NO es lo mismo que un
// subindicador directo) y el llamador decide cómo combinarlos para mostrar.
export async function listDimensions(organizationId: string, frameworkId: string) {
  return db
    .select({
      id: dimension.id,
      organizationId: dimension.organizationId,
      frameworkId: dimension.frameworkId,
      title: dimension.title,
      description: dimension.description,
      order: dimension.order,
      createdAt: dimension.createdAt,
      updatedAt: dimension.updatedAt,
      indicatorCount: sql<number>`count(distinct ${indicator.id})::int`,
      directSubindicatorCount: sql<number>`count(distinct ${subindicator.id})::int`,
    })
    .from(dimension)
    .leftJoin(indicator, eq(indicator.dimensionId, dimension.id))
    .leftJoin(subindicator, eq(subindicator.dimensionId, dimension.id))
    .where(and(eq(dimension.frameworkId, frameworkId), eq(dimension.organizationId, organizationId)))
    .groupBy(dimension.id)
    .orderBy(asc(dimension.order));
}

// VS-049 (docs/domain/evaluation-hierarchy.md "Numeración y orden
// persistido en el Builder"): drag-and-drop de Dimensiones — valida que
// TODOS los orderedIds pertenezcan al Framework y Organización indicados
// antes de escribir nada (mismo criterio de tenant-scoping que el resto
// del dominio, nunca confiar en que el cliente mandó IDs válidos).
export async function reorderDimensions(organizationId: string, frameworkId: string, orderedIds: string[]) {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: dimension.id })
      .from(dimension)
      .where(and(eq(dimension.frameworkId, frameworkId), eq(dimension.organizationId, organizationId)));
    const existingIds = new Set(existing.map((r) => r.id));
    if (orderedIds.length !== existingIds.size || !orderedIds.every((id) => existingIds.has(id))) {
      throw new Error("orderedIds no coincide con las dimensiones de este framework");
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.update(dimension).set({ order: i }).where(eq(dimension.id, orderedIds[i]!));
    }
  });
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

  const [maxRow] = await db
    .select({ max: sql<number | null>`max(${indicator.order})` })
    .from(indicator)
    .where(eq(indicator.dimensionId, input.dimensionId));
  const order = (maxRow?.max ?? -1) + 1;

  const rows = await db
    .insert(indicator)
    .values({
      id: randomUUID(),
      organizationId,
      dimensionId: input.dimensionId,
      title: input.title,
      description: input.description ?? null,
      order,
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
    .where(and(eq(indicator.dimensionId, dimensionId), eq(indicator.organizationId, organizationId)))
    .orderBy(asc(indicator.order));
}

// VS-049 — drag-and-drop de Indicadores, mismo criterio que reorderDimensions.
export async function reorderIndicators(organizationId: string, dimensionId: string, orderedIds: string[]) {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: indicator.id })
      .from(indicator)
      .where(and(eq(indicator.dimensionId, dimensionId), eq(indicator.organizationId, organizationId)));
    const existingIds = new Set(existing.map((r) => r.id));
    if (orderedIds.length !== existingIds.size || !orderedIds.every((id) => existingIds.has(id))) {
      throw new Error("orderedIds no coincide con los indicadores de esta dimensión");
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.update(indicator).set({ order: i }).where(eq(indicator.id, orderedIds[i]!));
    }
  });
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

  // VS-049: `order` es por padre — bajo el mismo Indicador, o entre los
  // directos de la misma Dimensión (dos listas separadas, nunca mezcladas).
  const parentWhere = input.indicatorId
    ? eq(subindicator.indicatorId, input.indicatorId)
    : eq(subindicator.dimensionId, input.dimensionId!);
  const [maxRow] = await db
    .select({ max: sql<number | null>`max(${subindicator.order})` })
    .from(subindicator)
    .where(parentWhere);
  const order = (maxRow?.max ?? -1) + 1;

  const rows = await db
    .insert(subindicator)
    .values({
      id: randomUUID(),
      organizationId,
      indicatorId: input.indicatorId ?? null,
      dimensionId: input.dimensionId ?? null,
      title: input.title,
      description: input.description ?? null,
      order,
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
    .where(and(eq(subindicator.indicatorId, indicatorId), eq(subindicator.organizationId, organizationId)))
    .orderBy(asc(subindicator.order));
}

// Subindicadores directos bajo Dimensión (VS-029) — misma forma que
// listSubindicators, filtra por dimensionId en vez de indicatorId.
export async function listDirectSubindicators(organizationId: string, dimensionId: string) {
  return db
    .select()
    .from(subindicator)
    .where(and(eq(subindicator.dimensionId, dimensionId), eq(subindicator.organizationId, organizationId)))
    .orderBy(asc(subindicator.order));
}

// VS-049 — drag-and-drop de Subindicadores, mismo criterio que
// reorderDimensions/reorderIndicators. `parentKind` distingue si
// `parentId` es un Indicador o una Dimensión (subindicadores directos,
// VS-029) — son dos listas de hermanos independientes, nunca mezcladas.
export async function reorderSubindicators(
  organizationId: string,
  parentId: string,
  parentKind: "indicator" | "dimension",
  orderedIds: string[],
) {
  const parentWhere = parentKind === "indicator" ? eq(subindicator.indicatorId, parentId) : eq(subindicator.dimensionId, parentId);
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: subindicator.id })
      .from(subindicator)
      .where(and(parentWhere, eq(subindicator.organizationId, organizationId)));
    const existingIds = new Set(existing.map((r) => r.id));
    if (orderedIds.length !== existingIds.size || !orderedIds.every((id) => existingIds.has(id))) {
      throw new Error("orderedIds no coincide con los subindicadores de este padre");
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.update(subindicator).set({ order: i }).where(eq(subindicator.id, orderedIds[i]!));
    }
  });
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
