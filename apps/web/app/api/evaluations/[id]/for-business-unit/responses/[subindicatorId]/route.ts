import {
  assertAnswersRespectExclusions,
  assertCanWriteBlock,
  getAppContext,
  getAssignmentForBusinessUnit,
  getResponse,
  upsertResponse,
} from "@plataforma-csa/db";
import { preserveReviewKeys, type ResponseAnswers, upsertResponseInput } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string; subindicatorId: string }>;
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const ctx = await getAppContext(request.headers);
    if (!ctx.unitId) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    const organizationId = ctx.unitId;
    const { id: evaluationId, subindicatorId } = await params;

    const assignment = await getAssignmentForBusinessUnit(evaluationId, organizationId);
    if (!assignment) {
      return Response.json({ error: "evaluation_assignment_NOT_FOUND" }, { status: 403 });
    }
    await assertCanWriteBlock(ctx, evaluationId, subindicatorId);

    const { answers } = upsertResponseInput.parse(await request.json());
    await assertAnswersRespectExclusions(evaluationId, subindicatorId, organizationId, answers);

    const current = await getResponse(evaluationId, subindicatorId, organizationId);
    const safeAnswers = preserveReviewKeys((current?.answers as ResponseAnswers | undefined) ?? {}, answers);
    const row = await upsertResponse(evaluationId, subindicatorId, safeAnswers, organizationId, {
      id: ctx.userId,
      name: ctx.userName,
    });
    return Response.json({ response: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}
