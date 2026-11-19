import { getAppContext, requestUserDeletion } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

// VS-035: el admin de unidad solicita la eliminación de un usuario de su unidad.
export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await getAppContext(request.headers);
    const { id } = await params;
    return Response.json(await requestUserDeletion(ctx, id));
  } catch (error) {
    return toErrorResponse(error);
  }
}
