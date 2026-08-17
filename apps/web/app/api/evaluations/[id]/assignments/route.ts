import {
  assignEvaluation,
  getEvaluation,
  listAssignments,
  requireActiveMember,
  requireWriteAccess,
} from "@plataforma-csa/db";
import { assignEvaluationInput } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

// VS-054 (docs/domain/business-units.md, "Panel Publicar"): gestión de
// asignaciones de unidades de negocio a una Evaluación.

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { organizationId } = await requireActiveMember(request.headers);
    const { id } = await params;

    // Validar que la organización es dueña de la Evaluación.
    const evaluation = await getEvaluation(organizationId, id);
    if (!evaluation) {
      return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });
    }

    const assignments = await listAssignments(organizationId, id);
    return Response.json({ assignments });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { organizationId } = await requireWriteAccess(request.headers);
    const { id } = await params;

    // Validar que la organización es dueña de la Evaluación.
    const evaluation = await getEvaluation(organizationId, id);
    if (!evaluation) {
      return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });
    }

    const { businessUnitOrganizationId } = assignEvaluationInput.parse(await request.json());
    const assignment = await assignEvaluation(organizationId, id, { businessUnitOrganizationId });
    return Response.json({ assignment }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
