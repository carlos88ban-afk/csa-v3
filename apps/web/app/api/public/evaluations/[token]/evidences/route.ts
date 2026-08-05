import { getEvaluationByToken } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";
import { belongsToEvaluation, deleteEvidence, isR2Configured } from "@/lib/r2";

// Motor engine/evidences v1 (ver docs/engines/evidences.md). Borra el objeto
// de R2 cuando el evaluado quita un archivo de su Respuesta. Idempotente: una
// key inexistente no es error (el objeto ya no está o nunca existió).

interface Params {
  params: Promise<{ token: string }>;
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { token } = await params;
    const ev = await getEvaluationByToken(token);
    if (!ev) return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });
    if (!isR2Configured()) {
      return Response.json({ error: "EVIDENCES_NOT_CONFIGURED" }, { status: 503 });
    }

    const body = (await request.json()) as { key?: unknown };
    const key = typeof body.key === "string" ? body.key : null;
    if (!key) return Response.json({ error: "VALIDATION_ERROR" }, { status: 400 });

    // Anti-IDOR por key: solo se borra lo que pertenece a la Evaluación del
    // token (ver spec de evidences.md).
    if (!belongsToEvaluation(key, ev.id)) {
      return Response.json({ error: "key_NOT_FOUND" }, { status: 404 });
    }

    await deleteEvidence(key);
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
