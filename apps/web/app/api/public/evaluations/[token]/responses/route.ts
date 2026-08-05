import { getEvaluationByToken, listResponses } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

// Sin auth a propósito, mismo criterio que ../route.ts (ver docs/engines/persistence.md):
// el acceso depende del token, no de una sesión.

interface Params {
  params: Promise<{ token: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { token } = await params;
    const ev = await getEvaluationByToken(token);
    if (!ev) return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });
    const responses = await listResponses(ev.id);
    return Response.json({ responses });
  } catch (error) {
    return toErrorResponse(error);
  }
}
