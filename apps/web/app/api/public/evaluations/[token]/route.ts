import { getEvaluationByToken } from "@plataforma-csa/db";

// Sin requireActiveMember a propósito (ver docs/engines/publishing.md): la
// seguridad de este endpoint depende exclusivamente de que `token` sea
// impredecible, no de una sesión. No agregar auth aquí — para eso existe
// /api/evaluations (autenticado).

interface Params {
  params: Promise<{ token: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const row = await getEvaluationByToken(token);
  if (!row) return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });
  return Response.json({ evaluation: row });
}
