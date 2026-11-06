"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { useMe } from "@/lib/use-me";

export default function HomePage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const { me, loading } = useMe();

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.push("/login");
      return;
    }
    if (loading || !me) return;
    router.push(me.appRole === "corporate_admin" ? "/evaluations" : "/mi-evaluacion");
  }, [isPending, session, me, loading, router]);

  return <main className="loading">Cargando...</main>;
}
