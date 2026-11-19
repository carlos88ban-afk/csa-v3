import { evaluationPendingChanges, requireCorporateAdmin } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

// Cambios del árbol aún no aplicados a la evaluación en curso (sin contar la visibilidad, que es en vivo).
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { corporateOrgId } = await requireCorporateAdmin(request.headers);
    const res = await evaluationPendingChanges(corporateOrgId, id);
    if (!res) return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });
    return Response.json(res);
  } catch (error) {
    return toErrorResponse(error);
  }
}
