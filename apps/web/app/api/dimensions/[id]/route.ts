import { deleteDimension, getDimension, requireActiveMember, requireWriteAccess, updateDimension } from "@plataforma-csa/db";
import { updateDimensionInput } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireActiveMember(request.headers);
    const row = await getDimension(organizationId, id);
    if (!row) return Response.json({ error: "dimension_NOT_FOUND" }, { status: 404 });
    return Response.json({ dimension: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireWriteAccess(request.headers);
    const input = updateDimensionInput.parse(await request.json());
    const row = await updateDimension(organizationId, id, input);
    if (!row) return Response.json({ error: "dimension_NOT_FOUND" }, { status: 404 });
    return Response.json({ dimension: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireWriteAccess(request.headers);
    const row = await deleteDimension(organizationId, id);
    if (!row) return Response.json({ error: "dimension_NOT_FOUND" }, { status: 404 });
    return Response.json({ dimension: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}
