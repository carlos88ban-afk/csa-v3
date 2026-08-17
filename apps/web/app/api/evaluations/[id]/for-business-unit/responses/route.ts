import {
  getAssignmentForBusinessUnit,
  listResponses,
  requireActiveMember,
} from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

// VS-054 (docs/domain/business-units.md, "Acceso del evaluado"): carga las
// respuestas de la unidad de negocio autenticada para una Evaluación.

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { organizationId } = await requireActiveMember(request.headers);
    const { id: evaluationId } = await params;

    // Validar que la unidad tiene asignación para esta Evaluación (403 si no).
    const assignment = await getAssignmentForBusinessUnit(evaluationId, organizationId);
    if (!assignment) {
      return Response.json({ error: "evaluation_assignment_NOT_FOUND" }, { status: 403 });
    }

    // listResponses ya filtra por businessUnitOrganizationId (VS-051).
    const responses = await listResponses(evaluationId, organizationId);
    return Response.json({ responses });
  } catch (error) {
    return toErrorResponse(error);
  }
}
