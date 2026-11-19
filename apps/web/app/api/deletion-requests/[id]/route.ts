import { getAppContext, resolveDeletionRequest } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

// VS-035: el corporativo aprueba (borra al usuario) o rechaza (borra la solicitud).
export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await getAppContext(request.headers);
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { approve?: boolean };
    return Response.json(await resolveDeletionRequest(ctx, id, body.approve === true));
  } catch (error) {
    return toErrorResponse(error);
  }
}
