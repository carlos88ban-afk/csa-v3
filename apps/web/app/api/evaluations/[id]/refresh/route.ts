import { refreshEvaluationSnapshot, requireCorporateAdmin } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

// Actualiza la evaluación en curso con los cambios hechos en el árbol; conserva respuestas, enlace y plazo.
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { corporateOrgId } = await requireCorporateAdmin(request.headers);
    const evaluation = await refreshEvaluationSnapshot(corporateOrgId, id);
    if (!evaluation) return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
