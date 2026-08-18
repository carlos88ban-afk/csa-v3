import {
  getBusinessUnitProgress,
  getEvaluation,
  listAssignments,
  listChildOrganizations,
  requireActiveMember,
} from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

// VS-055 (docs/domain/business-units.md, "Dashboard de avance
// corporativo"): progreso por unidad de negocio para la matriz. Solo la
// organización dueña de la Evaluación puede pedirlo — getEvaluation ya
// tenant-scopea (una unidad de negocio recibe 404, no ve el progreso de
// otras unidades, ver "Aislamiento de progreso" en el spec).

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireActiveMember(request.headers);

    const evaluation = await getEvaluation(organizationId, id);
    if (!evaluation) return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });

    const [assignments, childOrgs] = await Promise.all([
      listAssignments(organizationId, id),
      listChildOrganizations(organizationId),
    ]);
    const nameById = new Map(childOrgs.map((org) => [org.id, org.name]));

    const units = await Promise.all(
      assignments.map(async (assignment) => {
        const progress = await getBusinessUnitProgress(id, assignment.businessUnitOrganizationId);
        return {
          businessUnitOrganizationId: assignment.businessUnitOrganizationId,
          name: nameById.get(assignment.businessUnitOrganizationId) ?? assignment.businessUnitOrganizationId,
          ...progress,
        };
      }),
    );

    return Response.json({ units });
  } catch (error) {
    return toErrorResponse(error);
  }
}
