import { deleteEvaluation, getEvaluation, requireActiveMember, requireWriteAccess } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

// VS-018 (docs/engines/persistence.md, "Estado por pregunta"): la página de
// Revisión necesita el snapshot completo de la Evaluación — no existía un GET
// individual autenticado, solo el DELETE de abajo y el lookup interno que ya
// usaba export/route.ts.
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireActiveMember(request.headers);
    const evaluation = await getEvaluation(organizationId, id);
    if (!evaluation) return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });
    return Response.json({ evaluation });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireWriteAccess(request.headers);
    const row = await deleteEvaluation(organizationId, id);
    if (!row) return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });
    return Response.json({ evaluation: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}
