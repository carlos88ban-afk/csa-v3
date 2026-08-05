import { createSubindicator, listSubindicators, requireActiveMember, requireWriteAccess } from "@plataforma-csa/db";
import { createSubindicatorInput } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

export async function GET(request: Request) {
  try {
    const { organizationId } = await requireActiveMember(request.headers);
    const indicatorId = new URL(request.url).searchParams.get("indicatorId");
    if (!indicatorId) {
      return Response.json({ error: "indicatorId_QUERY_PARAM_REQUIRED" }, { status: 400 });
    }
    const rows = await listSubindicators(organizationId, indicatorId);
    return Response.json({ subindicators: rows });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireWriteAccess(request.headers);
    const input = createSubindicatorInput.parse(await request.json());
    const row = await createSubindicator(organizationId, input);
    return Response.json({ subindicator: row }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
