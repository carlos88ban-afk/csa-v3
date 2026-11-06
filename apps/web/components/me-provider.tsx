"use client";

import { createContext, useContext, type ReactNode } from "react";
import { clearApiCache } from "@/lib/api-cache";
import type { Me } from "@/lib/me";

const MeContext = createContext<Me | null>(null);
let lastUserId: string | null = null;

// La sesion llega resuelta desde el servidor (layout del grupo (app)): nunca
// hay un estado "sin sesion" que pinte la navegacion privada a medias.
export function MeProvider({ me, children }: { me: Me; children: ReactNode }) {
  if (lastUserId !== me.userId) {
    clearApiCache();
    lastUserId = me.userId;
  }
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

export function useMe(): { me: Me; loading: false } {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe fuera de MeProvider");
  return { me, loading: false };
}
