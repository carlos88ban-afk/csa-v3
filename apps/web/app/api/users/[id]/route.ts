import { getAppContext, removeManagedUser } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await getAppContext(request.headers);
    if (ctx.appRole === "evaluator") return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    const { id } = await params;
    await removeManagedUser(ctx, id);
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
