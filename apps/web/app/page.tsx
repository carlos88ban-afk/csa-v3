"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";

export default function HomePage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (isPending) return;
    router.push(session ? "/organizations" : "/login");
  }, [isPending, session, router]);

  return <main className="loading">Cargando...</main>;
}
