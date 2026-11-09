"use client";

// Celda con varios elementos (texto, campos, lista, casilla, enlaces): cada uno se dibuja
// como lo verá el evaluado y se edita en el sitio. El modelo interno (components) no se ve.

import { useState } from "react";
import type { FormTableCell } from "@plataforma-csa/sdk-core";

const uid = () => crypto.randomUUID();
export type Comp = NonNullable<FormTableCell["components"]>[number];

export function plainOf(label: string): string {
  if (!/[<&]/.test(label)) return label;
  const d = document.createElement("div");
  d.innerHTML = label;
  return d.textContent ?? "";
}
export const toLabel = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Texto de una celda: cada línea es un párrafo (el primero en negrita si hay varios).
export function htmlLines(h: string): string {
  if (!/[<&]/.test(h)) return h;
  const d = document.createElement("div");
  d.innerHTML = h.replace(/<\/p>|<br\s*\/?>/gi, "\n");
  return (d.textContent ?? "").replace(/\n+$/, "");
}
export function linesHtml(t: string): string {
  const lines = t.split("\n");
  if (lines.length === 1) return toLabel(t);
  return lines.map((l, i) => (i === 0 ? `<p><strong>${toLabel(l)}</strong></p>` : `<p>${toLabel(l)}</p>`)).join("");
}

export const COMP_ADD: { label: string; make: () => Comp }[] = [
  { label: "Texto", make: () => ({ id: uid(), type: "texto_fijo", content: "" }) },
  { label: "Respuesta", make: () => ({ id: uid(), type: "texto_corto" }) },
  { label: "Número", make: () => ({ id: uid(), type: "numero" }) },
  { label: "Lista", make: () => ({ id: uid(), type: "seleccion_desplegable", options: [{ id: uid(), label: "Opción 1" }, { id: uid(), label: "Opción 2" }] }) },
  { label: "Casilla", make: () => ({ id: uid(), type: "casilla", checkboxLabel: "" }) },
  { label: "Enlaces", make: () => ({ id: uid(), type: "referencia", references: { maxUrls: 3 } }) },
];

export function MixedCell({ cell, onChange }: { cell: FormTableCell; onChange: (comps: Comp[]) => void }) {
  const comps = (cell.components ?? []) as Comp[];
  const [optsOpen, setOptsOpen] = useState<string | null>(null);
  const patch = (id: string, p: Record<string, unknown>) => onChange(comps.map((c) => (c.id === id ? ({ ...c, ...p } as Comp) : c)));
  const drop = (id: string) => onChange(comps.filter((c) => c.id !== id));
  return (
    <div className="lc-mixed">
      {comps.map((c) => (
        <div className="lc-mixed__item" key={c.id}>
          {c.type === "texto_fijo" && (
            <textarea className="lc-input lc-text" rows={1} value={plainOf(c.content ?? "")} placeholder="Texto" aria-label="Texto" onChange={(e) => patch(c.id, { content: toLabel(e.target.value) })} />
          )}
          {c.type === "texto_corto" && (
            <div className="lc-mixed__field">
              <input className="lc-input" value={c.label ?? ""} placeholder="Título del campo (opcional)" aria-label="Título del campo" onChange={(e) => patch(c.id, { label: e.target.value || undefined })} />
              <input className="lc-input lc-input--ghost" disabled placeholder={c.maxLength ? `Respuesta (máx. ${c.maxLength} caracteres)` : "Respuesta de texto"} />
            </div>
          )}
          {c.type === "numero" && (
            <div className="lc-mixed__field">
              <input className="lc-input" value={c.label ?? ""} placeholder="Título del campo (opcional)" aria-label="Título del campo" onChange={(e) => patch(c.id, { label: e.target.value || undefined })} />
              <span className="lc-numeric">
                <input className="lc-input lc-input--ghost" disabled placeholder="0" />
                <input className="lc-unit" value={c.unit ?? ""} placeholder="unidad" aria-label="Unidad" onChange={(e) => patch(c.id, { unit: e.target.value || undefined })} />
              </span>
            </div>
          )}
          {c.type === "seleccion_desplegable" && (
            <div className="lc-mixed__field">
              <input className="lc-input" value={plainOf(c.label ?? "")} placeholder="Título de la lista (opcional)" aria-label="Título de la lista" onChange={(e) => patch(c.id, { label: toLabel(e.target.value) || undefined })} />
              <span className="lc-numeric">
                <select className="lc-input" defaultValue="" aria-label="Lista (vista previa)">
                  <option value="">Elegir…</option>
                  {c.options.map((o) => <option key={o.id} value={o.id}>{plainOf(o.label)}</option>)}
                </select>
                <button type="button" className="lc-ghost" onClick={() => setOptsOpen(optsOpen === c.id ? null : c.id)}>✎ Opciones</button>
              </span>
              {optsOpen === c.id && (
                <textarea
                  className="lc-input lc-opts"
                  rows={Math.max(3, c.options.length)}
                  defaultValue={c.options.map((o) => plainOf(o.label)).join("\n")}
                  aria-label="Opciones de la lista, una por línea"
                  onBlur={(e) => {
                    const lines = e.target.value.split("\n").map((x) => x.trim()).filter(Boolean);
                    if (lines.length) patch(c.id, { options: lines.map((l, i) => ({ id: c.options[i]?.id ?? uid(), label: toLabel(l) })) });
                  }}
                />
              )}
            </div>
          )}
          {c.type === "casilla" && (
            <label className="lc-check">
              <input type="checkbox" disabled />
              <input className="lc-input" value={plainOf(c.checkboxLabel ?? "")} placeholder="Texto de la casilla" aria-label="Texto de la casilla" onChange={(e) => patch(c.id, { checkboxLabel: toLabel(e.target.value) })} />
            </label>
          )}
          {c.type === "referencia" && (
            <div className="lc-ref">
              🔗 Enlaces o documentos de respaldo · máx.
              <input type="number" min={1} value={c.references?.maxUrls ?? 3} aria-label="Máximo de enlaces" onChange={(e) => patch(c.id, { references: { ...(c.references ?? {}), maxUrls: Math.max(1, Number(e.target.value) || 1) } })} />
            </div>
          )}
          {c.type === "calculado" && <div className="lc-special">Resultado calculado</div>}
          <button type="button" className="lc-mixed__x" aria-label="Quitar" onClick={() => drop(c.id)}>✕</button>
        </div>
      ))}
      <div className="lc-mixed__add">
        {COMP_ADD.map((a) => (
          <button key={a.label} type="button" className="lc-ghost" onClick={() => onChange([...comps, a.make()])}>＋ {a.label}</button>
        ))}
      </div>
    </div>
  );
}
