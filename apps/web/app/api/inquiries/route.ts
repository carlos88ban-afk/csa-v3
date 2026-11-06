import { createInquiry, getAppContext, listInquiries } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

export async function GET(request: Request) {
  try {
    const ctx = await getAppContext(request.headers);
    return Response.json({ inquiries: await listInquiries(ctx) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAppContext(request.headers);
    const body = (await request.json()) as { subject?: string; body?: string };
    const created = await createInquiry(ctx, { subject: body.subject ?? "", body: body.body ?? "" });
    return Response.json(created, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
