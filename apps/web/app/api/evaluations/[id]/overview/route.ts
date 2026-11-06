import { getOverview, requireCorporateAdmin } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireCorporateAdmin(request.headers);
    const { id } = await params;
    return Response.json({ rows: await getOverview(id, ctx.corporateOrgId) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
