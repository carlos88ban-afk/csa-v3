import type { EvaluationSnapshot } from "@plataforma-csa/sdk-core";
import { eq } from "drizzle-orm";
import { db } from "../client.js";
import { evaluationAssignment } from "../schema/evaluation-assignment.js";
import { evaluation } from "../schema/evaluation.js";
import { getAssignmentForBusinessUnit, listExclusions } from "./evaluation-assignment-service.js";
import { NotFoundError, ValidationError } from "./service.js";

// VS-053 (docs/domain/business-units.md, "Acceso del evaluado"): flujo
// autenticado para unidades de negocio. Sin `organizationId` como primer
// parámetro — el contexto es la UNIDAD (businessUnitOrganizationId =
// session.activeOrganizationId), no la matriz.

/**
 * Verifica si una Evaluación está en "modo corporativo" (tiene al menos una
 * fila en evaluation_assignment). Usado tanto por la ruta pública (para
 * bloquearla si aplica) como por validaciones internas.
 */
export async function isCorporateMode(evaluationId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: evaluationAssignment.id })
    .from(evaluationAssignment)
    .where(eq(evaluationAssignment.evaluationId, evaluationId))
    .limit(1);
  return !!row;
}

type SnapshotSubindicator = EvaluationSnapshot["dimensions"][number]["indicators"][number]["subindicators"][number];

/**
 * Filtra un snapshot quitando elementos excluidos para una unidad de negocio.
 * - `elementId = null` en una exclusión → excluye el Subindicador COMPLETO.
 * - `elementId` puntual → excluye solo ese elemento del formSchema.
 * - Un Subindicador que queda con `elements: []` tras filtrar SIGUE
 *   apareciendo en el árbol (no se oculta el nodo), solo sin contenido —
 *   así lo dice el spec explícitamente para evitar confusión de numeración
 *   discontinua.
 */
function filterSnapshotByExclusions(
  snapshot: EvaluationSnapshot,
  exclusions: Array<{ subindicatorId: string; elementId: string | null }>,
): EvaluationSnapshot {
  // Agrupar exclusiones por subindicatorId para lookup rápido.
  const exclusionMap = new Map<string, Set<string | null>>();
  for (const excl of exclusions) {
    if (!exclusionMap.has(excl.subindicatorId)) {
      exclusionMap.set(excl.subindicatorId, new Set());
    }
    exclusionMap.get(excl.subindicatorId)!.add(excl.elementId);
  }

  function filterSubindicator(sub: SnapshotSubindicator): SnapshotSubindicator {
    const excluded = exclusionMap.get(sub.id);
    if (!excluded) return sub; // Sin exclusiones, devuelve sin cambios.
    
    // formSchema puede ser null en el tipo (legacy), pero en la práctica
    // siempre tiene valor — si fuera null, no hay elementos que filtrar.
    if (!sub.formSchema) return sub;

    // Si hay exclusión de Subindicador completo (elementId = null), vaciar elements.
    if (excluded.has(null)) {
      return { ...sub, formSchema: { ...sub.formSchema, elements: [] } };
    }

    // Filtrar elementos puntuales.
    const filteredElements = sub.formSchema.elements.filter((el) => !excluded.has(el.id));
    return { ...sub, formSchema: { ...sub.formSchema, elements: filteredElements } };
  }

  return {
    ...snapshot,
    dimensions: snapshot.dimensions.map((dim) => ({
      ...dim,
      indicators: dim.indicators.map((ind) => ({
        ...ind,
        subindicators: ind.subindicators.map(filterSubindicator),
      })),
      subindicators: dim.subindicators.map(filterSubindicator),
    })),
  };
}

/**
 * Resuelve la Evaluación filtrada para una unidad de negocio autenticada.
 * - 404 si la Evaluación no existe.
 * - 403 si la unidad no tiene asignación vigente para la Evaluación.
 * - Devuelve el snapshot con exclusiones aplicadas.
 */
export async function getEvaluationForBusinessUnit(evaluationId: string, businessUnitOrganizationId: string) {
  // Verificar que la Evaluación exista (sin org — está en modo corporativo,
  // no aplica tenant-scoping tradicional aquí).
  const [ev] = await db.select().from(evaluation).where(eq(evaluation.id, evaluationId));
  if (!ev) throw new NotFoundError("evaluation");

  // Verificar asignación.
  const assignment = await getAssignmentForBusinessUnit(evaluationId, businessUnitOrganizationId);
  if (!assignment) throw new NotFoundError("evaluation_assignment");

  // Aplicar exclusiones.
  const exclusions = await listExclusions(assignment.id);
  const filteredSnapshot = filterSnapshotByExclusions(ev.snapshot as EvaluationSnapshot, exclusions);

  return {
    ...ev,
    snapshot: filteredSnapshot,
  };
}

/**
 * Valida que un conjunto de respuestas (answers) no intente tocar elementos
 * excluidos para una unidad de negocio. Lanza ValidationError si alguna clave
 * de `answers` corresponde a un `elementId` excluido.
 */
export async function assertAnswersRespectExclusions(
  evaluationId: string,
  subindicatorId: string,
  businessUnitOrganizationId: string,
  answers: Record<string, unknown>,
): Promise<void> {
  const assignment = await getAssignmentForBusinessUnit(evaluationId, businessUnitOrganizationId);
  if (!assignment) throw new NotFoundError("evaluation_assignment");

  const exclusions = await listExclusions(assignment.id);

  // Subindicador completo excluido → rechazar cualquier respuesta.
  const subindicatorExcluded = exclusions.some(
    (excl) => excl.subindicatorId === subindicatorId && excl.elementId === null,
  );
  if (subindicatorExcluded && Object.keys(answers).length > 0) {
    throw new ValidationError("ANSWER_TO_EXCLUDED_SUBINDICATOR");
  }

  // Elementos puntuales excluidos → rechazar respuestas a esos elementos.
  const excludedElementIds = new Set(
    exclusions
      .filter((excl) => excl.subindicatorId === subindicatorId && excl.elementId !== null)
      .map((excl) => excl.elementId!),
  );

  for (const key of Object.keys(answers)) {
    // Las claves de answers pueden ser elementId directo o statusKey(elementId).
    // statusKey = `${elementId}::status` (ver sdk-core/src/response.ts).
    const elementId = key.endsWith("::status") ? key.slice(0, -8) : key;
    if (excludedElementIds.has(elementId)) {
      throw new ValidationError("ANSWER_TO_EXCLUDED_ELEMENT");
    }
  }
}

/**
 * Devuelve la matriz (organizationId dueña) de una Evaluación. Usado para
 * validar que `session.activeOrganizationId` sea la matriz antes de permitir
 * lectura cross-unidad (excepción del spec).
 */
export async function getEvaluationMatrizOrganizationId(evaluationId: string): Promise<string | null> {
  const [ev] = await db.select({ organizationId: evaluation.organizationId }).from(evaluation).where(eq(evaluation.id, evaluationId));
  return ev?.organizationId ?? null;
}
