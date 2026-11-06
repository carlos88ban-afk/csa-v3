import { getAppContext, getCurrentEvaluation } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

export async function GET(request: Request) {
  try {
    const ctx = await getAppContext(request.headers);
    return Response.json({ evaluation: await getCurrentEvaluation(ctx.corporateOrgId) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
