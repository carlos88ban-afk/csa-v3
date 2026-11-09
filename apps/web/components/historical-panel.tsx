"use client";

import { useEffect, useMemo, useState } from "react";
import { consolidateHistorical, stripCommentHtml, type FormElement, type FormTableRow, type HistoricalMap } from "@plataforma-csa/sdk-core";
import { api } from "@/lib/api-client";

interface Unit { id: string; name: string; sigla: string | null; active: boolean }
let unitsCache: Promise<Unit[]> | null = null;
const loadUnits = () => (unitsCache ??= api.get<{ units: Unit[] }>("/api/units").then((r) => r.units.filter((u) => u.active)));

type Columns = { id: string }[];
type TableRef = { key: string; title: string; columns: Columns; rows: FormTableRow[]; apply: (rows: FormTableRow[]) => Partial<FormElement> };

// Tablas de un elemento: la propia (tabla_datos) y las que cuelgan de una opción / sub-opción.
function tablesOf(el: FormElement): TableRef[] {
  const out: TableRef[] = [];
  if (el.type === "tabla_datos") {
    out.push({ key: "self", title: "Tabla", columns: el.columns, rows: el.rows, apply: (rows) => ({ rows }) as Partial<FormElement> });
  }
  if ("options" in el && el.options) {
    el.options.forEach((o, oi) => {
      const opt = o as { label: string; table?: { columns: Columns; rows: FormTableRow[] }; subOptions?: { label: string; table?: { columns: Columns; rows: FormTableRow[] } }[] };
      if (opt.table) {
        const t = opt.table;
        out.push({
          key: `o${oi}`, title: `Tabla de la opción “${short(opt.label)}”`, columns: t.columns, rows: t.rows,
          apply: (rows) => ({ options: el.options!.map((x, i) => (i === oi ? { ...x, table: { ...t, rows } } : x)) }) as Partial<FormElement>,
        });
      }
      opt.subOptions?.forEach((s, si) => {
        if (!s.table) return;
        const t = s.table;
        out.push({
          key: `o${oi}s${si}`, title: `Tabla de “${short(s.label)}”`, columns: t.columns, rows: t.rows,
          apply: (rows) => ({
            options: el.options!.map((x, i) => (i === oi ? { ...x, subOptions: (x as { subOptions?: unknown[] }).subOptions!.map((y, j) => (j === si ? { ...(y as object), table: { ...t, rows } } : y)) } : x)),
          }) as Partial<FormElement>,
        });
      });
    });
  }
  return out;
}

const short = (html: string) => {
  const t = stripCommentHtml(html);
  return t.length > 50 ? t.slice(0, 50) + "…" : t;
};

export function hasTables(el: FormElement) {
  return tablesOf(el).length > 0;
}

// Una celda admite histórico si el evaluado la completa con un valor (no es título ni casilla/referencia).
function isDataCell(c: FormTableRow["cells"][number]) {
  return c.editable !== false && (c.cellType === "numero" || c.cellType === "texto" || c.cellType === "seleccion_desplegable" || c.cellType === "calculado");
}

export function HistoricalPanel({ el, onChange }: { el: FormElement; onChange: (patch: Partial<FormElement>) => void }) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [view, setView] = useState<"expandida" | "consolidada">("expandida");
  useEffect(() => { void loadUnits().then((u) => { setUnits(u); setUnitId((cur) => cur ?? u[0]?.id ?? null); }); }, []);
  const tables = useMemo(() => tablesOf(el), [el]);
  const unitName = (u: Unit) => u.sigla || u.name;

  if (tables.length === 0) return null;

  function setValue(t: TableRef, rowIdx: number, colId: string, raw: string) {
    if (!unitId) return;
    const rows = t.rows.map((r, ri) =>
      ri !== rowIdx ? r : {
        ...r,
        cells: r.cells.map((c) => {
          if (c.columnId !== colId) return c;
          const hist: HistoricalMap = { ...(c.historical ?? {}) };
          const v = raw.trim();
          if (v === "") delete hist[unitId];
          else hist[unitId] = c.cellType === "numero" && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : v;
          const { historical: _drop, ...rest } = c;
          void _drop;
          return Object.keys(hist).length ? { ...rest, historical: hist } : rest;
        }),
      },
    );
    onChange(t.apply(rows));
  }

  // Pegar desde Excel: tabuladores/saltos de línea se reparten a partir de la celda donde se pega.
  function pasteGrid(t: TableRef, rowIdx: number, colIdx: number, text: string) {
    if (!unitId || !/[\t\n]/.test(text)) return false;
    const grid = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));
    const rows = t.rows.map((r, ri) => {
      const dr = ri - rowIdx;
      if (dr < 0 || dr >= grid.length) return r;
      return {
        ...r,
        cells: r.cells.map((c) => {
          const dc = t.columns.findIndex((col) => col.id === c.columnId) - colIdx;
          const raw = grid[dr]?.[dc];
          if (dc < 0 || raw === undefined || !isDataCell(c)) return c;
          const hist: HistoricalMap = { ...(c.historical ?? {}) };
          const v = raw.trim();
          if (v === "") delete hist[unitId];
          else hist[unitId] = c.cellType === "numero" && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : v;
          const { historical: _drop, ...rest } = c;
          void _drop;
          return Object.keys(hist).length ? { ...rest, historical: hist } : rest;
        }),
      };
    });
    onChange(t.apply(rows));
    return true;
  }

  const filled = tables.reduce((n, t) => n + t.rows.reduce((m, r) => m + r.cells.filter((c) => c.historical && Object.keys(c.historical).length).length, 0), 0);

  return (
    <div className="hist">
      <p className="hist__lead">
        El dato histórico lo ve el evaluado como referencia, <strong>solo el de su unidad</strong>. Cárgalo por unidad (vista expandida) o revisa el total (vista consolidada).
        {filled > 0 && <> · {filled} celdas con histórico.</>}
      </p>
      <div className="hist__bar">
        <div className="hist__seg" role="tablist" aria-label="Vista">
          <button type="button" role="tab" aria-selected={view === "expandida"} className={view === "expandida" ? "on" : ""} onClick={() => setView("expandida")}>Expandida (por unidad)</button>
          <button type="button" role="tab" aria-selected={view === "consolidada"} className={view === "consolidada" ? "on" : ""} onClick={() => setView("consolidada")}>Consolidada</button>
        </div>
        {view === "expandida" && units.length > 0 && (
          <div className="hist__units" role="tablist" aria-label="Unidad">
            {units.map((u) => (
              <button key={u.id} type="button" role="tab" aria-selected={unitId === u.id} className={unitId === u.id ? "on" : ""} onClick={() => setUnitId(u.id)}>{unitName(u)}</button>
            ))}
          </div>
        )}
      </div>

      {tables.map((t) => (
        <div key={t.key} className="hist__table">
          {tables.length > 1 && <div className="hist__title">{t.title}</div>}
          <div className="hist__scroll">
            <table>
              <tbody>
                {t.rows.map((r, ri) => (
                  <tr key={r.id}>
                    {t.columns.map((col, ci) => {
                      const c = r.cells.find((x) => x.columnId === col.id);
                      if (!c) return <td key={col.id} className="hist__blank" />;
                      if (!isDataCell(c)) {
                        const txt = c.content ? stripCommentHtml(c.content) : c.checkboxLabel ? "☐ " + stripCommentHtml(c.checkboxLabel) : "";
                        return <th key={col.id} scope={ri === 0 ? "col" : "row"}>{short(txt)}</th>;
                      }
                      if (view === "consolidada") {
                        const total = consolidateHistorical(c.historical);
                        const detail = Object.entries(c.historical ?? {}).map(([id, v]) => `${unitName(units.find((u) => u.id === id) ?? ({ id, name: id, sigla: null, active: true }))}: ${v}`).join(" · ");
                        return (
                          <td key={col.id} title={detail || "Sin histórico"} className={total === null && detail ? "hist__mixed" : ""}>
                            {total !== null ? <strong>{total.toLocaleString("es-PE")}</strong> : detail ? <span className="hist__detail">{detail}</span> : <span className="hist__none">—</span>}
                          </td>
                        );
                      }
                      return (
                        <td key={col.id}>
                          <input
                            aria-label={`Histórico, fila ${ri + 1}, columna ${ci + 1}`}
                            value={c.historical?.[unitId ?? ""] !== undefined ? String(c.historical![unitId!]) : ""}
                            inputMode={c.cellType === "numero" ? "decimal" : undefined}
                            onChange={(e) => setValue(t, ri, col.id, e.target.value)}
                            onPaste={(e) => { const txt = e.clipboardData.getData("text/plain"); if (pasteGrid(t, ri, ci, txt)) e.preventDefault(); }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {view === "expandida" && <p className="hist__hint">Tip: copia un rango de Excel y pégalo en la primera celda; se reparte solo.</p>}
    </div>
  );
}
