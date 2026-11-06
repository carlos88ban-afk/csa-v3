import { cache } from "react";
import { headers } from "next/headers";
import { auth, getAppContext, listUnits } from "@plataforma-csa/db";
import type { Me } from "@/lib/me";

// Sesion resuelta en el servidor, una vez por request. null = no autenticado
// (o sin acceso: unidad desactivada, sin organizacion).
export const getServerMe = cache(async (): Promise<Me | null> => {
  try {
    const h = await headers();
    const ctx = await getAppContext(h);
    const session = await auth.api.getSession({ headers: h });
    let unitName: string | null = null;
    let unitSigla: string | null = null;
    if (ctx.unitId) {
      const unit = (await listUnits(ctx.corporateOrgId)).find((u) => u.id === ctx.unitId);
      unitName = unit?.name ?? null;
      unitSigla = unit?.sigla ?? null;
    }
    return {
      userId: ctx.userId,
      name: ctx.userName,
      email: session?.user.email ?? "",
      appRole: ctx.appRole,
      unitId: ctx.unitId,
      unitName,
      unitSigla,
    };
  } catch {
    return null;
  }
});
