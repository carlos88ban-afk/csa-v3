import { listDimensions, listDirectSubindicators, listIndicators, listSubindicators, requireActiveMember } from "@plataforma-csa/db";
import { toErrorResponse } from "@/lib/api-errors";

interface Params {
  params: Promise<{ id: string }>;
}

// Estructura completa (dimension > indicador > subindicador) en una sola
// llamada: el Builder la pedia nivel por nivel, una peticion por nodo.
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireActiveMember(request.headers);
    const dims = await listDimensions(organizationId, id);
    const tree = await Promise.all(
      dims.map(async (dimension) => {
        const [indicators, directSubs] = await Promise.all([
          listIndicators(organizationId, dimension.id),
          listDirectSubindicators(organizationId, dimension.id),
        ]);
        const withSubs = await Promise.all(
          indicators.map(async (indicator) => ({
            indicator: { id: indicator.id, title: indicator.title },
            subs: (await listSubindicators(organizationId, indicator.id)).map((s) => ({ id: s.id, title: s.title })),
          })),
        );
        return {
          dimension: { id: dimension.id, title: dimension.title },
          indicators: withSubs,
          directSubs: directSubs.map((s) => ({ id: s.id, title: s.title })),
        };
      }),
    );
    return Response.json({ tree });
  } catch (error) {
    return toErrorResponse(error);
  }
}
