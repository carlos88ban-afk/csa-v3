"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useMe } from "@/components/me-provider";

const key = (userId: string) => `inq-seen:${userId}`;

/** Marca como vistas las respuestas actuales (al abrir «Consultas»). */
export function markAnswersSeen(userId: string) {
  try {
    localStorage.setItem(key(userId), new Date().toISOString());
    window.dispatchEvent(new Event("inq-seen"));
  } catch {
    /* sin almacenamiento: el aviso simplemente no se descarta */
  }
}

/** Cantidad de consultas respondidas por el corporativo desde la última visita a «Consultas». Solo unidades. */
export function useNewAnswers(): number {
  const { me } = useMe();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (me.appRole === "corporate_admin") return;
    let alive = true;
    const run = () => {
      api
        .get<{ inquiries: Array<{ answeredAt: string | null }> }>("/api/inquiries")
        .then((r) => {
          let seen = "";
          try {
            seen = localStorage.getItem(key(me.userId)) ?? "";
          } catch {
            /* ignore */
          }
          const n = r.inquiries.filter((i) => i.answeredAt && i.answeredAt > seen).length;
          if (alive) setCount(n);
        })
        .catch(() => {});
    };
    run();
    window.addEventListener("inq-seen", run);
    return () => {
      alive = false;
      window.removeEventListener("inq-seen", run);
    };
  }, [me.appRole, me.userId]);
  return count;
}
