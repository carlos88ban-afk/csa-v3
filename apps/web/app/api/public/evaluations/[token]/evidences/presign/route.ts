import { randomUUID } from "node:crypto";
import { getEvaluationByToken } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";
import { createUploadUrl, isR2Configured } from "@/lib/r2";
import { effectiveMaxFiles, effectiveMaxSizeMb, resolveEvidenceElement, typeAllowed } from "@/lib/evidence-validation";

// Motor engine/evidences v1 (ver docs/engines/evidences.md). Sin auth a
// propósito, mismo criterio que el resto de rutas bajo public/: el acceso
// depende del token de la Evaluación, no de una sesión.

interface Params {
  params: Promise<{ token: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { token } = await params;
    const ev = await getEvaluationByToken(token);
    if (!ev) return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });
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
