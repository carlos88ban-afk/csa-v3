import { deleteFramework, getFramework, requireActiveMember, updateFramework } from "@plataforma-csa/db";
import { updateFrameworkInput } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

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
    const { organizationId } = await requireActiveMember(request.headers);
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
    const { organizationId } = await requireActiveMember(request.headers);
    const row = await deleteFramework(organizationId, id);
    if (!row) return Response.json({ error: "framework_NOT_FOUND" }, { status: 404 });
    return Response.json({ framework: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}
