import { getAppContext, getEvaluationForBusinessUnit } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await getAppContext(request.headers);
    if (!ctx.unitId) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    const { id } = await params;
    const evaluation = await getEvaluationForBusinessUnit(id, ctx.unitId, { userId: ctx.userId, appRole: ctx.appRole });
    return Response.json({ evaluation });
  } catch (error) {
    return toErrorResponse(error);
  }
}
