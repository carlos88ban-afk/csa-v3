import { getEvaluationForBusinessUnit, requireActiveMember } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";
import { belongsToEvaluation, deleteEvidence, isR2Configured } from "@/lib/r2";

// VS-058 (docs/domain/business-units.md, "Acceso del evaluado"): espejo
// autenticado de app/api/public/evaluations/[token]/evidences/route.ts —
// mismo comportamiento, pero resolviendo la Evaluación vía
// getEvaluationForBusinessUnit (valida asignación de la unidad, 404 si no
// existe evaluación o asignación) en vez de getEvaluationByToken.

interface Params {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, { params }: Params) {
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

    // Anti-IDOR por key: solo se borra lo que pertenece a la Evaluación
    // (mismo criterio que la ruta pública).
    if (!belongsToEvaluation(key, ev.id)) {
      return Response.json({ error: "key_NOT_FOUND" }, { status: 404 });
    }

    await deleteEvidence(key);
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
