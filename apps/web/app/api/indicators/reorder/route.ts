import { reorderIndicators, requireWriteAccess } from "@plataforma-csa/db";
import { reorderInput } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

// VS-049 (docs/domain/evaluation-hierarchy.md "Numeración y orden
// persistido en el Builder"): drag-and-drop de Indicadores dentro de una
// Dimensión.
export async function POST(request: Request) {
  try {
    const { organizationId } = await requireWriteAccess(request.headers);
    const dimensionId = new URL(request.url).searchParams.get("dimensionId");
    if (!dimensionId) {
      return Response.json({ error: "dimensionId_QUERY_PARAM_REQUIRED" }, { status: 400 });
    }
    const { orderedIds } = reorderInput.parse(await request.json());
    await reorderIndicators(organizationId, dimensionId, orderedIds);
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
