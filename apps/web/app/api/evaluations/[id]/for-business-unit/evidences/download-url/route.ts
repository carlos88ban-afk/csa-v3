import { getEvaluationForBusinessUnit, requireActiveMember } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";
import { belongsToEvaluation, createDownloadUrl, evidenceExists, isR2Configured } from "@/lib/r2";

// VS-058 (docs/domain/business-units.md, "Acceso del evaluado"): espejo
// autenticado de .../public/evaluations/[token]/evidences/download-url/route.ts.

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireActiveMember(request.headers);
    const ev = await getEvaluationForBusinessUnit(id, organizationId);
    if (!isR2Configured()) {
      return Response.json({ error: "EVIDENCES_NOT_CONFIGURED" }, { status: 503 });
    }

    const body = (await request.json()) as { key?: unknown };
    const key = typeof body.key === "string" ? body.key : null;
    if (!key) return Response.json({ error: "VALIDATION_ERROR" }, { status: 400 });

    // Anti-IDOR por key: solo se puede descargar lo que pertenece a esta
    // Evaluación (mismo criterio que la ruta pública).
    if (!belongsToEvaluation(key, ev.id)) {
      return Response.json({ error: "key_NOT_FOUND" }, { status: 404 });
    }
    if (!(await evidenceExists(key))) {
      return Response.json({ error: "key_NOT_FOUND" }, { status: 404 });
    }

    const url = await createDownloadUrl(key);
    return Response.json({ url });
  } catch (error) {
    return toErrorResponse(error);
  }
}
