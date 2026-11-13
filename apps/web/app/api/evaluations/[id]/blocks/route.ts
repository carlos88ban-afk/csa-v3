import { assignResponsibleByEmail, getAppContext, listBlocks, setBlockResponsible } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

function unitFor(ctx: Awaited<ReturnType<typeof getAppContext>>, requested: string | null | undefined) {
  if (ctx.appRole === "evaluator") throw new Error("FORBIDDEN");
  const unitId = ctx.appRole === "unit_admin" ? ctx.unitId : requested;
  if (!unitId) throw new Error("UNIT_REQUIRED");
  return unitId;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await getAppContext(request.headers);
    const { id } = await params;
    const unitId = unitFor(ctx, new URL(request.url).searchParams.get("unit"));
    return Response.json({ blocks: await listBlocks(id, unitId) });
  } catch (error) {
    if (error instanceof Error && (error.message === "FORBIDDEN" || error.message === "UNIT_REQUIRED")) {
      return Response.json({ error: error.message }, { status: error.message === "FORBIDDEN" ? 403 : 400 });
    }
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const ctx = await getAppContext(request.headers);
    const { id } = await params;
    const body = (await request.json()) as {
      unitId?: string;
      subindicatorId?: string;
      userId?: string | null;
      email?: string;
      name?: string;
      subindicatorIds?: string[];
    };
    const unitId = unitFor(ctx, body.unitId);
    if (body.email !== undefined) {
      return Response.json(
        await assignResponsibleByEmail(id, unitId, { email: body.email, name: body.name, subindicatorIds: body.subindicatorIds ?? [] }),
      );
    }
    if (!body.subindicatorId) return Response.json({ error: "subindicatorId_REQUIRED" }, { status: 400 });
    await setBlockResponsible(id, unitId, body.subindicatorId, body.userId ?? null);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && (error.message === "FORBIDDEN" || error.message === "UNIT_REQUIRED")) {
      return Response.json({ error: error.message }, { status: error.message === "FORBIDDEN" ? 403 : 400 });
    }
    return toErrorResponse(error);
  }
}
