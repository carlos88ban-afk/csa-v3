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

/**
 * Unidades: consultas respondidas por el corporativo desde la última visita a «Consultas».
 * Corporativo: consultas pendientes de responder.
 */
export function useNewAnswers(): number {
  const { me } = useMe();
  const [count, setCount] = useState(0);
  useEffect(() => {
    const corp = me.appRole === "corporate_admin";
    let alive = true;
    const run = () => {
      api
        .get<{ inquiries: Array<{ answeredAt: string | null; status: string }> }>("/api/inquiries")
        .then((r) => {
          if (corp) {
            if (alive) setCount(r.inquiries.filter((i) => i.status === "open").length);
            return;
          }
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
    const timer = setInterval(run, 60000);
    window.addEventListener("inq-seen", run);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("inq-seen", run);
    };
  }, [me.appRole, me.userId]);
  return count;
}
