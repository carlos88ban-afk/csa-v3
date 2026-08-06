import { getEvaluation, listResponses, requireActiveMember } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

// VS-018 (docs/engines/persistence.md, "Estado por pregunta"): lectura
// autenticada y tenant-scoped de las Respuestas de una Evaluación, para la
// página de Revisión — no reutiliza public/evaluations/[token]/responses
// (esa ruta no depende de sesión, mismo criterio que el resto de rutas
// public/ vs. autenticadas ya documentado en persistence.md/export.md).

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireActiveMember(request.headers);
    const evaluation = await getEvaluation(organizationId, id);
    if (!evaluation) return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });
    const responses = await listResponses(evaluation.id);
    return Response.json({ responses });
  } catch (error) {
    return toErrorResponse(error);
  }
}
