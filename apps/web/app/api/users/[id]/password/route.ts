import { getAppContext, resetManagedUserPassword } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

// Genera una contraseña nueva para un usuario visible para el administrador.
export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await getAppContext(request.headers);
    if (ctx.appRole === "evaluator") return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    const { id } = await params;
    return Response.json(await resetManagedUserPassword(ctx, id));
  } catch (error) {
    return toErrorResponse(error);
  }
}
