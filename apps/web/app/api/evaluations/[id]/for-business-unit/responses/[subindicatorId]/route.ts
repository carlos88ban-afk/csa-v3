import {
  assertAnswersRespectExclusions,
  getAssignmentForBusinessUnit,
  getResponse,
  requireActiveMember,
  upsertResponse,
} from "@plataforma-csa/db";
import { upsertResponseInput } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

// VS-053 (docs/domain/business-units.md, "Acceso del evaluado"): guardado
// de respuestas autenticado desde una unidad de negocio. Valida que:
// (a) la unidad tenga asignación vigente para la Evaluación, y
// (b) ninguna respuesta intente tocar un elemento excluido.

interface Params {
  params: Promise<{ id: string; subindicatorId: string }>;
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { organizationId } = await requireActiveMember(request.headers);
    const { id: evaluationId, subindicatorId } = await params;

    // Validar asignación (lanza 403 si no existe).
    const assignment = await getAssignmentForBusinessUnit(evaluationId, organizationId);
    if (!assignment) {
      return Response.json({ error: "evaluation_assignment_NOT_FOUND" }, { status: 403 });
    }

    const { answers } = upsertResponseInput.parse(await request.json());

    // Validar que las respuestas no toquen elementos excluidos (lanza
    // ValidationError con código específico).
    await assertAnswersRespectExclusions(evaluationId, subindicatorId, organizationId, answers);

    // upsertResponse ya valida el bloqueo por dueDate (VS-052) — no hay que
    // repetir esa validación aquí.
    const row = await upsertResponse(evaluationId, subindicatorId, answers, organizationId);
    return Response.json({ response: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}
