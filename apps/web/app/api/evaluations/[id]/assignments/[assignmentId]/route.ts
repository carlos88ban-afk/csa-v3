import {
  getEvaluation,
  requireWriteAccess,
  unassignEvaluation,
} from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

// VS-054 (docs/domain/business-units.md, "Panel Publicar"): desasignar una
// unidad de negocio de una Evaluación.

interface Params {
  params: Promise<{ id: string; assignmentId: string }>;
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { organizationId } = await requireWriteAccess(request.headers);
    const { id, assignmentId } = await params;

    // Validar que la organización es dueña de la Evaluación.
    const evaluation = await getEvaluation(organizationId, id);
    if (!evaluation) {
      return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });
    }

    const removed = await unassignEvaluation(organizationId, id, assignmentId);
    if (!removed) {
      return Response.json({ error: "assignment_NOT_FOUND" }, { status: 404 });
    }

    return Response.json({ assignment: removed });
  } catch (error) {
    return toErrorResponse(error);
  }
}
