import { ensureCorporateEvaluator, requireCorporateAdmin } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

// VS-080: asignar un responsable del corporativo desde el árbol (crea la cuenta si no existe).
export async function POST(request: Request) {
  try {
    const ctx = await requireCorporateAdmin(request.headers);
    const body = (await request.json()) as { email?: string; name?: string };
    return Response.json(await ensureCorporateEvaluator(ctx, { email: body.email ?? "", name: body.name }));
  } catch (error) {
    return toErrorResponse(error);
  }
}
