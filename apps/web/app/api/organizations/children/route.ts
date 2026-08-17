import { listChildOrganizations, requireActiveMember } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

// VS-054 (docs/domain/business-units.md, "Panel Publicar"): lista las
// organizaciones hijas (unidades de negocio) de la organización activa.

export async function GET(request: Request) {
  try {
    const { organizationId } = await requireActiveMember(request.headers);
    const organizations = await listChildOrganizations(organizationId);
    return Response.json({ organizations });
  } catch (error) {
    return toErrorResponse(error);
  }
}
