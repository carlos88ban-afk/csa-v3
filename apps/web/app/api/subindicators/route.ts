import {
  createSubindicator,
  listDirectSubindicators,
  listSubindicators,
  requireActiveMember,
  requireWriteAccess,
} from "@plataforma-csa/db";
import { createSubindicatorInput } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

// Subindicadores directos bajo Dimensión (VS-029, docs/domain/evaluation-hierarchy.md):
// acepta indicatorId (caso tradicional) o dimensionId (directo), uno de los dos.
export async function GET(request: Request) {
  try {
    const { organizationId } = await requireActiveMember(request.headers);
    const params = new URL(request.url).searchParams;
    const indicatorId = params.get("indicatorId");
    const dimensionId = params.get("dimensionId");
    if (!indicatorId && !dimensionId) {
      return Response.json({ error: "indicatorId_or_dimensionId_QUERY_PARAM_REQUIRED" }, { status: 400 });
    }
    const rows = indicatorId
      ? await listSubindicators(organizationId, indicatorId)
      : await listDirectSubindicators(organizationId, dimensionId!);
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
