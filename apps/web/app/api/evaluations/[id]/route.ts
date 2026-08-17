import { deleteEvaluation, getEvaluation, requireActiveMember, requireWriteAccess, updateEvaluation } from "@plataforma-csa/db";
import { updateEvaluationInput } from "@plataforma-csa/sdk-core";
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

// VS-052 (docs/domain/business-units.md, "Plazo de recepción"): edición del
// plazo/correo de contacto desde el panel Publicar — la matriz (write
// access). Las reglas de negocio (no volver a null una vez fijado, solo
// fechas futuras) se traducen a 400 vía ValidationError en toErrorResponse.
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireWriteAccess(request.headers);
    const input = updateEvaluationInput.parse(await request.json());
    const evaluation = await updateEvaluation(organizationId, id, input);
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
