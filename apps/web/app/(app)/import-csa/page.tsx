"use client";

import { useEffect, useRef, useState } from "react";
import { parsePastedText } from "@plataforma-csa/sdk-core";
import { api } from "@/lib/api-client";
import { htmlToMarkedText } from "@/lib/html-to-text";
import { Card } from "@/components/ui";

// Herramienta de QA: carga en bloque las preguntas capturadas del portal de S&P (en lugar de pegar una por una).
// Usa exactamente el mismo conversor y analizador que el pegado manual del Builder.
// Recibe, por postMessage desde la pestaña del portal, { titles: string[], items: {code,title,html}[] }.

interface Item { code: string; title: string; html: string }
const PORTAL = "https://portal.s1.spglobal.com";
const strip = (t: string) => t.replace(/^[\d.]+\s+/, "").trim();
const byCode = (a: string, b: string) => {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

export default function ImportCsaPage() {
  const [log, setLog] = useState<string[]>(["Esperando datos del portal…"]);
  const running = useRef(false);
  const say = (m: string) => setLog((l) => [...l.slice(-40), m]);

  useEffect(() => {
    async function onMessage(e: MessageEvent) {
      if (e.origin !== PORTAL || e.data?.type !== "csa-import" || running.current) return;
      running.current = true;
      const { titles, items, name } = e.data as { titles: string[]; items: Item[]; name?: string };
      const report: Record<string, { text: string; elements: number }> = {};
      try {
        const titleOf = (code: string) => strip(titles.find((t) => t.split(" ")[0] === code) ?? code);
        const fw = await api.post<{ framework: { id: string } }>("/api/frameworks", { name: name ?? "CSA 2026 — Importado del portal" });
        const fwId = fw.framework.id;
        const dims = new Map<string, string>(), inds = new Map<string, string>();
        const sorted = [...items].sort((a, b) => byCode(a.code, b.code));
        let n = 0;
        for (const it of sorted) {
          const [d, c] = it.code.split(".");
          const dk = d!, ck = `${d}.${c}`;
          if (!dims.has(dk)) dims.set(dk, (await api.post<{ dimension: { id: string } }>("/api/dimensions", { frameworkId: fwId, title: titleOf(dk) })).dimension.id);
          if (!inds.has(ck)) inds.set(ck, (await api.post<{ indicator: { id: string } }>("/api/indicators", { dimensionId: dims.get(dk), title: titleOf(ck) })).indicator.id);
          const text = htmlToMarkedText(it.html);
          const elements = parsePastedText(text).map((p) => p.element);
          const sub = await api.post<{ subindicator: { id: string } }>("/api/subindicators", { indicatorId: inds.get(ck), title: strip(it.title) });
          await api.patch(`/api/subindicators/${sub.subindicator.id}`, { formSchema: { schemaVersion: 1, elements } });
          report[it.code] = { text, elements: elements.length };
          n++;
          if (n % 10 === 0) say(`${n}/${sorted.length}`);
        }
        (window as unknown as { __importReport: unknown }).__importReport = { frameworkId: fwId, report };
        say(`LISTO: ${n} preguntas importadas`);
      } catch (err) {
        say("ERROR: " + (err instanceof Error ? err.message : String(err)));
      } finally {
        running.current = false;
      }
    }
    window.addEventListener("message", onMessage);
    (window as unknown as { __importReady: boolean }).__importReady = true;
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <main className="page">
      <h1>Importar CSA (QA)</h1>
      <Card>
        <pre>{log.join("\n")}</pre>
      </Card>
    </main>
  );
}
