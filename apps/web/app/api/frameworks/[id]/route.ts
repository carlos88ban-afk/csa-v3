import { deleteFramework, getFramework, listEvaluationIdsOfFramework, requireActiveMember, requireCorporateAdmin, requireWriteAccess, updateFramework, ValidationError } from "@plataforma-csa/db";
import { updateFrameworkInput } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";
import { deleteEvaluationFiles } from "@/lib/r2";

// VS-035: borrar una evaluación completa exige escribir ELIMINAR (también se valida aquí, no solo en la pantalla).
async function requireEliminar(request: Request) {
  const body = (await request.json().catch(() => null)) as { confirm?: string } | null;
  if (body?.confirm !== "ELIMINAR") throw new ValidationError("CONFIRM_REQUIRED");
}


interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireActiveMember(request.headers);
    const row = await getFramework(organizationId, id);
    if (!row) return Response.json({ error: "framework_NOT_FOUND" }, { status: 404 });
    return Response.json({ framework: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireWriteAccess(request.headers);
    const input = updateFrameworkInput.parse(await request.json());
    const row = await updateFramework(organizationId, id, input);
    if (!row) return Response.json({ error: "framework_NOT_FOUND" }, { status: 404 });
    return Response.json({ framework: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { corporateOrgId: organizationId } = await requireCorporateAdmin(request.headers);
    await requireEliminar(request);
    for (const evId of await listEvaluationIdsOfFramework(organizationId, id)) await deleteEvaluationFiles(evId);
    const row = await deleteFramework(organizationId, id);
    if (!row) return Response.json({ error: "framework_NOT_FOUND" }, { status: 404 });
    return Response.json({ framework: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}
