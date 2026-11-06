"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

export default function MiEvaluacionPage() {
  const router = useRouter();
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    api
      .get<{ evaluation: { id: string } | null }>("/api/current-evaluation")
      .then((res) => {
        if (res.evaluation) router.replace(`/evaluations/authenticated/${res.evaluation.id}`);
        else setEmpty(true);
      })
      .catch(() => router.push("/login"));
  }, [router]);
  if (empty)
    return (
      <main className="page">
        <h1>Mi evaluación</h1>
        <p className="page__lead">Todavía no hay una evaluación vigente. Te avisaremos cuando se abra.</p>
      </main>
    );
  return <main className="loading">Cargando...</main>;
}
