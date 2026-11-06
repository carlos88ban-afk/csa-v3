import { getAppContext, listUnits } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

export async function GET(request: Request) {
  try {
    const ctx = await getAppContext(request.headers);
    let unitName: string | null = null;
    let unitSigla: string | null = null;
    if (ctx.unitId) {
      const unit = (await listUnits(ctx.corporateOrgId)).find((u) => u.id === ctx.unitId);
      unitName = unit?.name ?? null;
      unitSigla = unit?.sigla ?? null;
    }
    return Response.json({
      userId: ctx.userId,
      name: ctx.userName,
      appRole: ctx.appRole,
      unitId: ctx.unitId,
      unitName,
      unitSigla,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
