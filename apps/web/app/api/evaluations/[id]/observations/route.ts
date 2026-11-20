import { evaluationBelongsToOrg, requireCorporateAdmin, setTemaObservation } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

// VS-081: observación del admin corporativo sobre un tema de una unidad (text = null la quita).
export async function PUT(request: Request, { params }: Params) {
  try {
    const ctx = await requireCorporateAdmin(request.headers);
    const { id } = await params;
    if (!(await evaluationBelongsToOrg(id, ctx.corporateOrgId))) return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });
    const body = (await request.json()) as { unitId?: string; subindicatorId?: string; text?: string | null };
    if (!body.unitId || !body.subindicatorId) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
    await setTemaObservation(id, body.subindicatorId, body.unitId, body.text ?? null, ctx.userName);
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
