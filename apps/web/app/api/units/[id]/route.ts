import { requireCorporateAdmin, updateUnit } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireCorporateAdmin(request.headers);
    const { id } = await params;
    const body = (await request.json()) as { name?: string; sigla?: string; active?: boolean };
    await updateUnit(ctx.corporateOrgId, id, body);
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
