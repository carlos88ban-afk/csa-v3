import { closeEvaluation, requireCorporateAdmin } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireCorporateAdmin(request.headers);
    const { id } = await params;
    await closeEvaluation(ctx.corporateOrgId, id);
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
