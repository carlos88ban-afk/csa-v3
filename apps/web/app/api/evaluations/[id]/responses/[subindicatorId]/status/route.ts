import { getEvaluation, requireCorporateAdmin, setElementStatus } from "@plataforma-csa/db";
import { setElementStatusInput } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string; subindicatorId: string }>;
}

// Revision por unidad: el administrador corporativo aprueba, entrega o devuelve
// respuestas de una unidad concreta (?unit=).
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, subindicatorId } = await params;
    const ctx = await requireCorporateAdmin(request.headers);
    const evaluation = await getEvaluation(ctx.corporateOrgId, id);
    if (!evaluation) return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });
    const unit = new URL(request.url).searchParams.get("unit");
    if (!unit) return Response.json({ error: "UNIT_REQUIRED" }, { status: 400 });

    const { elementId, status, comment } = setElementStatusInput.parse(await request.json());
    const row = await setElementStatus(evaluation.id, subindicatorId, elementId, status, unit, {
      by: ctx.userName,
      comment,
    });
    return Response.json({ response: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}
