"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui";

// Botón «Actualizar evaluación en curso»: siempre visible si hay una evaluación abierta. Se resalta con el
// número de cambios cuando el árbol tiene cambios sin aplicar (la visibilidad por unidad NO cuenta: es en vivo).
export function UpdateEvaluationButton({ frameworkId }: { frameworkId: string }) {
  const [ev, setEv] = useState<{ id: string; dueDate: string | null; frameworkId: string } | null>(null);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const check = useCallback(async () => {
    try {
      const cur = (await api.get<{ evaluation: { id: string; dueDate: string | null; frameworkId: string } | null }>("/api/current-evaluation")).evaluation;
      const open = cur && cur.frameworkId === frameworkId && (!cur.dueDate || new Date(cur.dueDate) > new Date()) ? cur : null;
      setEv(open);
      if (open) setPending((await api.get<{ count: number }>(`/api/evaluations/${open.id}/changes`)).count);
    } catch {
      /* sin evaluación vigente o sin permiso */
    }
  }, [frameworkId]);

  useEffect(() => {
    void check();
    const t = setInterval(() => void check(), 15000);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [check]);

  if (!ev) return null;

  async function update() {
    if (!ev) return;
    setBusy(true);
    try {
      await api.post(`/api/evaluations/${ev.id}/refresh`, {});
      setDone(true);
      setPending(0);
      setTimeout(() => setDone(false), 4000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant={pending > 0 ? "primary" : "secondary"}
      size="sm"
      disabled={busy || pending === 0}
      onClick={() => void update()}
      title="Aplica a la evaluación en curso los cambios del árbol, conservando respuestas, enlace y plazo. La visibilidad por unidad ya se aplica sola."
    >
      {busy ? "Actualizando…" : done ? "✓ Evaluación actualizada" : pending > 0 ? `Actualizar evaluación en curso (${pending} cambio${pending === 1 ? "" : "s"})` : "Evaluación en curso al día ✓"}
    </Button>
  );
}
