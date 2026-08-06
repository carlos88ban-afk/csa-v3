import { getEvaluationByToken, getResponse, upsertResponse } from "@plataforma-csa/db";
import { assertPublicResponseUpdateAllowed, type ResponseAnswers, upsertResponseInput } from "@plataforma-csa/sdk-core";
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
    // VS-018 (docs/engines/persistence.md, "Estado por pregunta"): el lado
    // público no puede fabricar/tocar un estado approved/submitted ni la
    // respuesta que ya quedó congelada por uno.
    const current = await getResponse(ev.id, subindicatorId);
    assertPublicResponseUpdateAllowed((current?.answers as ResponseAnswers | undefined) ?? {}, answers);
    const row = await upsertResponse(ev.id, subindicatorId, answers);
    return Response.json({ response: row });
  } catch (error) {
    return toErrorResponse(error);
  }
}
