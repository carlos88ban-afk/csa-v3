import { removeExclusion, requireWriteAccess } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

// VS-059 (docs/domain/business-units.md, "Filtrado de preguntas por
// unidad"): removeExclusion ya valida tenant-scoping internamente
// (requireOwnedAssignment en evaluation-assignment-service.ts).

interface Params {
  params: Promise<{ id: string; assignmentId: string; exclusionId: string }>;
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { organizationId } = await requireWriteAccess(request.headers);
    const { id, assignmentId, exclusionId } = await params;
    const removed = await removeExclusion(organizationId, id, assignmentId, exclusionId);
    if (!removed) return Response.json({ error: "exclusion_NOT_FOUND" }, { status: 404 });
    return Response.json({ exclusion: removed });
  } catch (error) {
    return toErrorResponse(error);
  }
}
