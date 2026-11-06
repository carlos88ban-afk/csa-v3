import { getAppContext, getAssignmentForBusinessUnit, listResponses } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await getAppContext(request.headers);
    if (!ctx.unitId) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    const { id: evaluationId } = await params;
    const assignment = await getAssignmentForBusinessUnit(evaluationId, ctx.unitId);
    if (!assignment) {
      return Response.json({ error: "evaluation_assignment_NOT_FOUND" }, { status: 403 });
    }
    const responses = await listResponses(evaluationId, ctx.unitId);
    return Response.json({ responses });
  } catch (error) {
    return toErrorResponse(error);
  }
}
