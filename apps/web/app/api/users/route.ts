import { createManagedUser, getAppContext, listUsers, type ManagedRole } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

export async function GET(request: Request) {
  try {
    const ctx = await getAppContext(request.headers);
    if (ctx.appRole === "evaluator") return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    return Response.json({ users: await listUsers(ctx) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAppContext(request.headers);
    if (ctx.appRole === "evaluator") return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    const body = (await request.json()) as { name?: string; email?: string; role?: ManagedRole; unitId?: string | null };
    const created = await createManagedUser(ctx, {
      name: body.name ?? "",
      email: body.email ?? "",
      role: body.role ?? "evaluator",
      unitId: body.unitId ?? null,
    });
    return Response.json(created, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
