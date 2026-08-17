import { AuthzError, EvaluationLockedError, NotFoundError, ValidationError } from "@plataforma-csa/db";
import { LockedElementError } from "@plataforma-csa/sdk-core";
import { ZodError } from "zod";

export function toErrorResponse(error: unknown): Response {
  if (error instanceof AuthzError) {
    const status = error.code === "UNAUTHENTICATED" ? 401 : 403;
    return Response.json({ error: error.code }, { status });
  }
  if (error instanceof NotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  // VS-052 — regla de negocio rechazada (p. ej. dueDate_CANNOT_CLEAR).
  if (error instanceof ValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  // VS-052 — bloqueo de escritura por plazo vencido (business-units.md).
  if (error instanceof EvaluationLockedError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof LockedElementError) {
    return Response.json({ error: "element_LOCKED", elementId: error.elementId }, { status: 403 });
  }
  if (error instanceof ZodError) {
    return Response.json({ error: "VALIDATION_ERROR", details: error.issues }, { status: 400 });
  }
  console.error(error);
  return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
}
