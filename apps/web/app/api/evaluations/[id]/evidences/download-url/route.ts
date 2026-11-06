import { evaluationBelongsToOrg, requireCorporateAdmin } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";
import { belongsToEvaluation, createDownloadUrl, evidenceExists, isR2Configured } from "@/lib/r2";

interface Params {
  params: Promise<{ id: string }>;
}

// El administrador corporativo descarga cualquier evidencia de la evaluacion.
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await requireCorporateAdmin(request.headers);
    if (!(await evaluationBelongsToOrg(id, ctx.corporateOrgId))) {
      return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });
    }
    if (!isR2Configured()) return Response.json({ error: "EVIDENCES_NOT_CONFIGURED" }, { status: 503 });
    const body = (await request.json()) as { key?: unknown };
    const key = typeof body.key === "string" ? body.key : null;
    if (!key || !belongsToEvaluation(key, id) || !(await evidenceExists(key))) {
      return Response.json({ error: "key_NOT_FOUND" }, { status: 404 });
    }
    return Response.json({ url: await createDownloadUrl(key) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
