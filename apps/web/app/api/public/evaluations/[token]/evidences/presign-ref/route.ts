import { randomUUID } from "node:crypto";
import { getEvaluationByToken } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";
import { createUploadUrl, isR2Configured } from "@/lib/r2";
import { findSnapshotSubindicator } from "@/lib/evidence-validation";

// Referencias flexibles (VS-045, docs/engines/form.md "Formato en preguntas y
// opciones + referencias flexibles"): presign de adjunto para un slot de
// referencia `refType: "flexible"` (documento interno de una opción/sub-
// opción). Mismo patrón que presign de evidencias (binario directo a R2, solo
// la ref {key,name,size,mimeType} vive en la Respuesta), pero sin exigir que
// el elemento sea `evidencia`: el slot de referencia pertenece al elemento
// que carga las opciones (seleccion_unica/multiple), que es cualquier tipo.

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
      return Response.json(
        { error: "VALIDATION_ERROR", details: "subindicatorId, elementId, fileName, contentType y size son requeridos" },
        { status: 400 },
      );
    }

    // VS-045: techo de 10 MB por adjunto de referencia flexible — mismo tope
    // que el límite cliente en el runtime; defensa en profundidad server-side
    // (un presign jamás debe emitirse para un binario que el cliente no puede
    // subir legítimamente).
    const MAX_REF_SIZE = 10 * 1024 * 1024;
    if (size <= 0 || size > MAX_REF_SIZE) {
      return Response.json({ error: "FILE_TOO_LARGE", details: "El archivo supera el límite de 10 MB" }, { status: 413 });
    }

    // Pertenencia contra el snapshot congelado (mismo principio que
    // response-service.ts): el elemento debe existir en el subindicador del
    // token — el slot de referencia vive bajo ese elemento, no en otro.
    const sub = findSnapshotSubindicator(ev.snapshot as Parameters<typeof findSnapshotSubindicator>[0], subindicatorId);
    if (!sub) return Response.json({ error: "subindicator_NOT_FOUND" }, { status: 404 });
    if (!sub.formSchema?.elements.some((el) => el.id === elementId)) {
      return Response.json({ error: "element_NOT_FOUND" }, { status: 404 });
    }

    const objectId = randomUUID();
    const { key, url } = await createUploadUrl(ev.id, objectId, contentType, size);
    return Response.json({ key, url });
  } catch (error) {
    return toErrorResponse(error);
  }
}