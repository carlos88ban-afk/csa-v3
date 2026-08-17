import { reorderDimensions, requireWriteAccess } from "@plataforma-csa/db";
import { reorderInput } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

// VS-049 (docs/domain/evaluation-hierarchy.md "Numeración y orden
// persistido en el Builder"): drag-and-drop de Dimensiones dentro de un
// Framework. `frameworkId` acota el alcance (query param, no body) porque
// el body es el mismo shape en los 3 endpoints de reorder.
export async function POST(request: Request) {
  try {
    const { organizationId } = await requireWriteAccess(request.headers);
    const frameworkId = new URL(request.url).searchParams.get("frameworkId");
    if (!frameworkId) {
      return Response.json({ error: "frameworkId_QUERY_PARAM_REQUIRED" }, { status: 400 });
    }
    const { orderedIds } = reorderInput.parse(await request.json());
    await reorderDimensions(organizationId, frameworkId, orderedIds);
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
