import { randomUUID } from "node:crypto";
import { getEvaluationForBusinessUnit, requireActiveMember } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";
import { createUploadUrl, isR2Configured } from "@/lib/r2";
import { findSnapshotSubindicator } from "@/lib/evidence-validation";

// VS-058 (docs/domain/business-units.md, "Acceso del evaluado"): espejo
// autenticado de .../public/evaluations/[token]/evidences/presign-ref/route.ts
// (referencias flexibles VS-045: adjunto de documento interno en un slot de
// referencia, no exclusivo del tipo `evidencia`). Mismo criterio que
// presign/route.ts: se resuelve contra el snapshot YA FILTRADO por
// exclusiones — un elemento excluido no aparece, así que el subindicador no
// lo encuentra y la ruta lo rechaza igual que "no existe".

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
      return Response.json(
        { error: "VALIDATION_ERROR", details: "subindicatorId, elementId, fileName, contentType y size son requeridos" },
        { status: 400 },
      );
    }

    const MAX_REF_SIZE = 10 * 1024 * 1024;
    if (size <= 0 || size > MAX_REF_SIZE) {
      return Response.json({ error: "FILE_TOO_LARGE", details: "El archivo supera el límite de 10 MB" }, { status: 413 });
    }

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
