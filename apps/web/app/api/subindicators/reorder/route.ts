import { reorderSubindicators, requireWriteAccess } from "@plataforma-csa/db";
import { reorderInput } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

// VS-049 (docs/domain/evaluation-hierarchy.md "Numeración y orden
// persistido en el Builder"): drag-and-drop de Subindicadores — bajo un
// Indicador, o directos bajo una Dimensión (VS-029), mismo criterio XOR
// que el resto de Subindicador (exactamente uno de los dos query params).
export async function POST(request: Request) {
  try {
    const { organizationId } = await requireWriteAccess(request.headers);
    const url = new URL(request.url);
    const indicatorId = url.searchParams.get("indicatorId");
    const dimensionId = url.searchParams.get("dimensionId");
    if (!!indicatorId === !!dimensionId) {
      return Response.json({ error: "EXACTLY_ONE_OF_indicatorId_OR_dimensionId_REQUIRED" }, { status: 400 });
    }
    const { orderedIds } = reorderInput.parse(await request.json());
    if (indicatorId) {
      await reorderSubindicators(organizationId, indicatorId, "indicator", orderedIds);
    } else {
      await reorderSubindicators(organizationId, dimensionId!, "dimension", orderedIds);
    }
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
