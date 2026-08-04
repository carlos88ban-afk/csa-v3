import { createDimension, listDimensions, requireActiveMember } from "@plataforma-csa/db";
import { createDimensionInput } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

export async function GET(request: Request) {
  try {
    const { organizationId } = await requireActiveMember(request.headers);
    const frameworkId = new URL(request.url).searchParams.get("frameworkId");
    if (!frameworkId) {
      return Response.json({ error: "frameworkId_QUERY_PARAM_REQUIRED" }, { status: 400 });
    }
    const rows = await listDimensions(organizationId, frameworkId);
    return Response.json({ dimensions: rows });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireActiveMember(request.headers);
    const input = createDimensionInput.parse(await request.json());
    const row = await createDimension(organizationId, input);
    return Response.json({ dimension: row }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
