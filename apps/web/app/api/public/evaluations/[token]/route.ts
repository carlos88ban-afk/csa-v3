import { getEvaluationByToken, isCorporateMode } from "@plataforma-csa/db";

// Sin requireActiveMember a propósito (ver docs/engines/publishing.md): la
// seguridad de este endpoint depende exclusivamente de que `token` sea
// impredecible, no de una sesión. No agregar auth aquí — para eso existe
// /api/evaluations (autenticado).
//
// VS-053 (docs/domain/business-units.md, "Modo corporativo vs modo público"):
// una Evaluación con AL MENOS UNA fila en evaluation_assignment está en "modo
// corporativo" y el token público deja de resolver (mismo 404 genérico que un
// token revocado/inexistente — no filtrar el motivo).

interface Params {
  params: Promise<{ token: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const row = await getEvaluationByToken(token);
  if (!row) return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });

  // Bloquear acceso si está en modo corporativo.
  if (await isCorporateMode(row.id)) {
    return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });
  }

  return Response.json({ evaluation: row });
}
