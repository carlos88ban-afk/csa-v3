import { getEvaluationByToken } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";
import { belongsToEvaluation, createDownloadUrl, evidenceExists, isR2Configured } from "@/lib/r2";

// Motor engine/evidences v1 (ver docs/engines/evidences.md). Genera una
// presigned GET on-demand: el binario se descarga directo del navegador a R2,
// nunca pasa por la función serverless (límite ~4.5MB de Vercel Hobby).

interface Params {
  params: Promise<{ token: string }>;
}

export async function POST(request: Request, { params }: Params) {
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

    // Anti-IDOR por key: solo se puede descargar lo que pertenece a la
    // Evaluación resuelta por el token (ver spec de evidences.md).
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
