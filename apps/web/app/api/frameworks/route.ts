import { createFramework, listFrameworks, requireActiveMember, requireWriteAccess } from "@plataforma-csa/db";
import { createFrameworkInput } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

export async function GET(request: Request) {
  try {
    const { organizationId } = await requireActiveMember(request.headers);
    const rows = await listFrameworks(organizationId);
    return Response.json({ frameworks: rows });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireWriteAccess(request.headers);
    const input = createFrameworkInput.parse(await request.json());
    const row = await createFramework(organizationId, input);
    return Response.json({ framework: row }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
