import { getEvaluationForBusinessUnit, requireActiveMember } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

// VS-053 (docs/domain/business-units.md, "Acceso del evaluado"): ruta
// autenticada para que una unidad de negocio acceda a su vista filtrada de
// la Evaluación. Reemplaza el consumo público de /api/public/evaluations/[token]
// en Runtime cuando la Evaluación tiene asignaciones (modo corporativo).

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { organizationId } = await requireActiveMember(request.headers);
    const { id } = await params;

    // getEvaluationForBusinessUnit lanza 403 si organizationId no tiene
    // asignación para esta Evaluación, y devuelve el snapshot filtrado.
    const evaluation = await getEvaluationForBusinessUnit(id, organizationId);
    return Response.json({ evaluation });
  } catch (error) {
    return toErrorResponse(error);
  }
}
