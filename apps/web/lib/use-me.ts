"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

export interface Me {
  userId: string;
  name: string;
  appRole: "corporate_admin" | "unit_admin" | "evaluator";
  unitId: string | null;
  unitName: string | null;
  unitSigla: string | null;
}

export const ROLE_LABEL: Record<Me["appRole"], string> = {
  corporate_admin: "Administrador corporativo",
  unit_admin: "Administrador de unidad",
  evaluator: "Evaluador",
};

export function useMe(): { me: Me | null; loading: boolean } {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api
      .get<Me>("/api/me")
      .then(setMe)
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);
  return { me, loading };
}
