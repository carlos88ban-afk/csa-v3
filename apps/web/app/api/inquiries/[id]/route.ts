import { answerInquiry, requireCorporateAdmin } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireCorporateAdmin(request.headers);
    const { id } = await params;
    const body = (await request.json()) as { answer?: string };
    await answerInquiry(ctx, id, body.answer ?? "");
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
