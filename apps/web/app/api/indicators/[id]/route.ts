import { deleteIndicator, getIndicator, requireActiveMember, updateIndicator } from "@plataforma-csa/db";
import { updateIndicatorInput } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireActiveMember(request.headers);
    const row = await getIndicator(organizationId, id);
    if (!row) return Response.json({ error: "indicator_NOT_FOUND" }, { status: 404 });
    return Response.json({ indicator: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireActiveMember(request.headers);
    const input = updateIndicatorInput.parse(await request.json());
    const row = await updateIndicator(organizationId, id, input);
    if (!row) return Response.json({ error: "indicator_NOT_FOUND" }, { status: 404 });
    return Response.json({ indicator: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireActiveMember(request.headers);
    const row = await deleteIndicator(organizationId, id);
    if (!row) return Response.json({ error: "indicator_NOT_FOUND" }, { status: 404 });
    return Response.json({ indicator: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}
