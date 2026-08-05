import { deleteEvaluation, requireActiveMember } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireActiveMember(request.headers);
    const row = await deleteEvaluation(organizationId, id);
    if (!row) return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });
    return Response.json({ evaluation: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}
