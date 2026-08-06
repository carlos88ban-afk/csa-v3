import { getEvaluation, requireWriteAccess, setElementStatus } from "@plataforma-csa/db";
import { setElementStatusInput } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

// VS-018 (ver docs/engines/persistence.md, "Estado por pregunta + flujo
// Approved/Submitted"): autenticada y tenant-scoped, a diferencia de
// public/evaluations/[token]/responses/[subindicatorId] — aprobar/enviar es
// una acción de revisión de la Organización, no del evaluado (mismo criterio
// que evaluations/[id]/export, no vive bajo public/).

interface Params {
  params: Promise<{ id: string; subindicatorId: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, subindicatorId } = await params;
    const { organizationId } = await requireWriteAccess(request.headers);
    const evaluation = await getEvaluation(organizationId, id);
    if (!evaluation) return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });

    const { elementId, status } = setElementStatusInput.parse(await request.json());
    const row = await setElementStatus(evaluation.id, subindicatorId, elementId, status);
    return Response.json({ response: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}
