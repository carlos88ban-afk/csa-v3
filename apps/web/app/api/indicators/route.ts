import { createIndicator, listIndicators, requireActiveMember, requireWriteAccess } from "@plataforma-csa/db";
import { createIndicatorInput } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

export async function GET(request: Request) {
  try {
    const { organizationId } = await requireActiveMember(request.headers);
    const dimensionId = new URL(request.url).searchParams.get("dimensionId");
    if (!dimensionId) {
      return Response.json({ error: "dimensionId_QUERY_PARAM_REQUIRED" }, { status: 400 });
    }
    const rows = await listIndicators(organizationId, dimensionId);
    return Response.json({ indicators: rows });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireWriteAccess(request.headers);
    const input = createIndicatorInput.parse(await request.json());
    const row = await createIndicator(organizationId, input);
    return Response.json({ indicator: row }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
