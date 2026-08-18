import { randomUUID } from "node:crypto";
import { getEvaluationForBusinessUnit, requireActiveMember } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";
import { createUploadUrl, isR2Configured } from "@/lib/r2";
import { effectiveMaxFiles, effectiveMaxSizeMb, resolveEvidenceElement, typeAllowed } from "@/lib/evidence-validation";

// VS-058 (docs/domain/business-units.md, "Acceso del evaluado"): espejo
// autenticado de .../public/evaluations/[token]/evidences/presign/route.ts.
// Usa el snapshot YA FILTRADO por exclusiones (getEvaluationForBusinessUnit)
// para resolver el elemento — un elemento `evidencia` excluido para esta
// unidad no aparece en ese snapshot, así que resolveEvidenceElement lo
// rechaza igual que si no existiera (mismo mecanismo que ya usa
// assertAnswersRespectExclusions para el guardado de respuestas, sin
// necesidad de código de exclusión nuevo acá).

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireActiveMember(request.headers);
    const ev = await getEvaluationForBusinessUnit(id, organizationId);
    if (!isR2Configured()) {
      return Response.json({ error: "EVIDENCES_NOT_CONFIGURED" }, { status: 503 });
    }

    const body = (await request.json()) as {
      subindicatorId?: unknown;
      elementId?: unknown;
      fileName?: unknown;
      contentType?: unknown;
      size?: unknown;
    };
    const subindicatorId = typeof body.subindicatorId === "string" ? body.subindicatorId : null;
    const elementId = typeof body.elementId === "string" ? body.elementId : null;
    const fileName = typeof body.fileName === "string" ? body.fileName : null;
    const contentType = typeof body.contentType === "string" ? body.contentType : null;
    const size = typeof body.size === "number" ? body.size : null;
    if (!subindicatorId || !elementId || !fileName || !contentType || size === null) {
      return Response.json({ error: "VALIDATION_ERROR", details: "subindicatorId, elementId, fileName, contentType y size son requeridos" }, { status: 400 });
    }

    const resolved = resolveEvidenceElement(ev.snapshot, subindicatorId, elementId);
    if (!resolved) {
      return Response.json({ error: "element_NOT_EVIDENCE" }, { status: 400 });
    }
    const { element } = resolved;

    const maxSizeMb = effectiveMaxSizeMb(element);
    if (size > maxSizeMb * 1024 * 1024) {
      return Response.json({ error: "FILE_TOO_LARGE", details: `Máximo ${maxSizeMb} MB` }, { status: 413 });
    }
    if (!typeAllowed(element, fileName, contentType)) {
      return Response.json({ error: "FILE_TYPE_NOT_ALLOWED" }, { status: 415 });
    }

    const objectId = randomUUID();
    const { key, url } = await createUploadUrl(ev.id, objectId, contentType, size);
    return Response.json({ key, url, maxFiles: effectiveMaxFiles(element), maxSizeMb });
  } catch (error) {
    return toErrorResponse(error);
  }
}
