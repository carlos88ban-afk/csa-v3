import { getAppContext, listDeletionRequests } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

export async function GET(request: Request) {
  try {
    const ctx = await getAppContext(request.headers);
    return Response.json({ requests: await listDeletionRequests(ctx) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
