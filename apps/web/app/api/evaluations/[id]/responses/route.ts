import { getEvaluation, listResponses, requireCorporateAdmin } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

// Respuestas de una unidad (?unit=) para la revision del administrador corporativo.
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { corporateOrgId } = await requireCorporateAdmin(request.headers);
    const evaluation = await getEvaluation(corporateOrgId, id);
    if (!evaluation) return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });
    const unit = new URL(request.url).searchParams.get("unit") ?? undefined;
    const responses = await listResponses(evaluation.id, unit);
    return Response.json({ responses });
  } catch (error) {
    return toErrorResponse(error);
  }
}
