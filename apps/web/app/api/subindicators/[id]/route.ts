import { deleteSubindicator, getSubindicator, requireActiveMember, updateSubindicator } from "@plataforma-csa/db";
import { updateSubindicatorInput } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireActiveMember(request.headers);
    const row = await getSubindicator(organizationId, id);
    if (!row) return Response.json({ error: "subindicator_NOT_FOUND" }, { status: 404 });
    return Response.json({ subindicator: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireActiveMember(request.headers);
    // formSchema no se acepta por API todavía (motor de formularios = M4).
    const input = updateSubindicatorInput.parse(await request.json());
    const row = await updateSubindicator(organizationId, id, input);
    if (!row) return Response.json({ error: "subindicator_NOT_FOUND" }, { status: 404 });
    return Response.json({ subindicator: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireActiveMember(request.headers);
    const row = await deleteSubindicator(organizationId, id);
    if (!row) return Response.json({ error: "subindicator_NOT_FOUND" }, { status: 404 });
    return Response.json({ subindicator: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}
