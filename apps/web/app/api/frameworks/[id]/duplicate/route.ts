import { duplicateFramework, requireWriteAccess } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { organizationId } = await requireWriteAccess(request.headers);
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const copy = await duplicateFramework(organizationId, id, body.name ?? "");
    return Response.json(copy, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
