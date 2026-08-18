import { listAssignments, listExclusions, requireActiveMember, requireWriteAccess, setExclusion } from "@plataforma-csa/db";
import { setExclusionInput } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

// VS-059 (docs/domain/business-units.md, "Panel Publicar" / "Filtrado de
// preguntas por unidad"): editor de exclusiones por Subindicador/elemento.
// setExclusion/listExclusions ya existían desde VS-050 (evaluation-
// assignment-service.ts) sin ruta API — este slice las expone.

interface Params {
  params: Promise<{ id: string; assignmentId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { organizationId } = await requireActiveMember(request.headers);
    const { id, assignmentId } = await params;
    // listExclusions(assignmentId) en sí no tiene tenant-scoping (mismo
    // criterio que getAssignmentForBusinessUnit — el contexto lo da el
    // caller) — listAssignments SÍ valida que la Evaluación sea de esta
    // organización, y acá se confirma además que assignmentId sea una de
    // sus propias asignaciones antes de listar sus exclusiones.
    const assignments = await listAssignments(organizationId, id);
    if (!assignments.some((a) => a.id === assignmentId)) {
      return Response.json({ error: "evaluation_assignment_NOT_FOUND" }, { status: 404 });
    }
    const exclusions = await listExclusions(assignmentId);
    return Response.json({ exclusions });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { organizationId } = await requireWriteAccess(request.headers);
    const { id, assignmentId } = await params;
    const input = setExclusionInput.parse(await request.json());
    const exclusion = await setExclusion(organizationId, id, assignmentId, input);
    return Response.json({ exclusion }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
