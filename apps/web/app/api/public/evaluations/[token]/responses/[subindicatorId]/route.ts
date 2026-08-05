import { getEvaluationByToken, upsertResponse } from "@plataforma-csa/db";
import { upsertResponseInput } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";

// Sin auth a propósito, mismo criterio que ../../route.ts (ver docs/engines/persistence.md):
// el acceso depende del token, no de una sesión.

interface Params {
  params: Promise<{ token: string; subindicatorId: string }>;
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { token, subindicatorId } = await params;
    const ev = await getEvaluationByToken(token);
    if (!ev) return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });

    const { answers } = upsertResponseInput.parse(await request.json());
    const row = await upsertResponse(ev.id, subindicatorId, answers);
    return Response.json({ response: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}
