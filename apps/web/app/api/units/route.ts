import { createUnit, getAppContext, listUnits, requireCorporateAdmin } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

export async function GET(request: Request) {
  try {
    const ctx = await getAppContext(request.headers);
    const units = await listUnits(ctx.corporateOrgId);
    return Response.json({ units: ctx.appRole === "corporate_admin" ? units : units.filter((u) => u.id === ctx.unitId) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireCorporateAdmin(request.headers);
    const body = (await request.json()) as { name?: string; sigla?: string };
    const unit = await createUnit(ctx.corporateOrgId, { name: body.name ?? "", sigla: body.sigla ?? "" });
    return Response.json({ unit }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
