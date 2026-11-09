"use client";

// Lienzo vivo: la pregunta se dibuja tal como la verá el evaluado (opciones reales,
// tablas reales, casillas y listas reales) y se edita en el mismo sitio. El usuario
// nunca ve la representación interna: aquí solo se traduce la interacción al modelo.

import { useEffect, useRef, useState } from "react";
import type { FormElement, FormTableCell, FormTableRow, TablaDatosConfig } from "@plataforma-csa/sdk-core";

import { MixedCell, plainOf, toLabel, htmlLines, linesHtml, type Comp } from "@/components/mixed-cell";

const uid = () => crypto.randomUUID();

/* ───────────── tipos de celda con nombres humanos ───────────── */

type Kind = "label" | "text" | "number" | "percent" | "list" | "check" | "mixed" | "special";

const KIND_NAME: Record<Kind, string> = {
  label: "Título o texto de la tabla",
  text: "El evaluado escribe texto",
  number: "El evaluado escribe un número",
  percent: "El evaluado escribe un porcentaje",
  list: "El evaluado elige de una lista",
  check: "El evaluado marca una casilla",
  mixed: "Varios elementos juntos (texto, campos, lista, casilla, enlaces)",
  special: "Celda con configuración especial",
};

function kindOf(c: FormTableCell | undefined): Kind {
  if (!c) return "label";
  if (c.components?.length) return "mixed";
  if (c.cellType === "calculado" || c.cellType === "referencia") return "special";
  if (c.editable === false) return "label";
  if (c.cellType === "numero") return c.unit === "%" ? "percent" : "number";
  if (c.cellType === "seleccion_desplegable") return "list";
  if (c.cellType === "casilla") return "check";
  return "text";
}

function applyKind(c: FormTableCell, k: Kind): FormTableCell {
  const base: FormTableCell = { columnId: c.columnId, cellType: "texto" };
  const keep = c.content !== undefined ? { content: c.content } : {};
  if (c.historical) (base as FormTableCell).historical = c.historical;
  switch (k) {
    case "label": return { ...base, editable: false, content: c.content ?? "" };
    case "text": return { ...base, ...keep };
    case "number": return { ...base, cellType: "numero" };
    case "percent": return { ...base, cellType: "numero", unit: "%" };
    case "list": return { ...base, cellType: "seleccion_desplegable", options: c.options?.length ? c.options : [{ id: uid(), label: "Sí" }, { id: uid(), label: "No" }] };
    case "check": return { ...base, cellType: "casilla", checkboxLabel: c.checkboxLabel ?? "Sí" };
    case "mixed": {
      const comps: Comp[] = [];
      if (c.content) comps.push({ id: uid(), type: "texto_fijo", content: c.content });
      comps.push({ id: uid(), type: "texto_corto" });
      return { ...base, components: comps };
    }
    default: return c;
  }
}

/* ───────────── tabla real ───────────── */

function TableCanvas({ table, onChange }: { table: TablaDatosConfig; onChange: (t: TablaDatosConfig) => void }) {
  const [menu, setMenu] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [dragRow, setDragRow] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const cols = table.columns;

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".lc-menu, .lc-cell__kind")) setMenu(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const cellAt = (r: FormTableRow, colId: string) => r.cells.find((c) => c.columnId === colId);
  const emit = (rows: FormTableRow[], columns = cols) => onChange({ ...table, columns, rows });

  function setCell(ri: number, colId: string, fn: (c: FormTableCell) => FormTableCell) {
    emit(
      table.rows.map((r, i) => {
        if (i !== ri) return r;
        const exists = r.cells.some((c) => c.columnId === colId);
        const cells = exists ? r.cells.map((c) => (c.columnId === colId ? fn(c) : c)) : [...r.cells, fn({ columnId: colId, cellType: "texto", editable: false, content: "" })];
        return { ...r, cells };
      }),
    );
  }

  function addRow(after: number) {
    const model = table.rows[Math.min(after, table.rows.length - 1)];
    const row: FormTableRow = {
      id: uid(),
      cells: cols.map((col, ci) => {
        const m = model ? cellAt(model, col.id) : undefined;
        if (ci === 0) return { columnId: col.id, cellType: "texto", editable: false, content: "" } as FormTableCell;
        return m ? ({ ...applyKind(m, kindOf(m) === "label" ? "text" : kindOf(m)), columnId: col.id, historical: undefined } as FormTableCell) : ({ columnId: col.id, cellType: "texto" } as FormTableCell);
      }),
    };
    const rows = [...table.rows];
    rows.splice(after + 1, 0, row);
    emit(rows);
  }
  function delRow(i: number) {
    if (table.rows.length <= 1) return;
    emit(table.rows.filter((_, k) => k !== i));
  }
  function addCol(after: number) {
    const id = uid();
    const columns = [...cols];
    columns.splice(after + 1, 0, { id });
    emit(
      table.rows.map((r, ri) => {
        const prev = cols[after] ? cellAt(r, cols[after]!.id) : undefined;
        const nc: FormTableCell = ri === 0 ? { columnId: id, cellType: "texto", editable: false, content: "" } : prev && kindOf(prev) !== "label" ? { ...applyKind(prev, kindOf(prev)), columnId: id, historical: undefined } : { columnId: id, cellType: "texto" };
        return { ...r, cells: [...r.cells, nc] };
      }),
      columns,
    );
  }
  function delCol(ci: number) {
    if (cols.length <= 1) return;
    const id = cols[ci]!.id;
    emit(table.rows.map((r) => ({ ...r, cells: r.cells.filter((c) => c.columnId !== id) })), cols.filter((_, k) => k !== ci));
  }
  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= table.rows.length) return;
    const rows = [...table.rows];
    const [x] = rows.splice(from, 1);
    rows.splice(to, 0, x!);
    emit(rows);
  }

  // Pegar un bloque de Excel/Word en una celda: se reparte desde ahí y la tabla crece si hace falta.
  function pasteGrid(ri: number, ci: number, text: string) {
    const grid = text.replace(/\r/g, "").replace(/\n+$/, "").split("\n").map((l) => l.split("\t"));
    let columns = [...cols];
    let rows = table.rows.map((r) => ({ ...r, cells: [...r.cells] }));
    const width = Math.max(...grid.map((g) => g.length));
    while (columns.length < ci + width) columns.push({ id: uid() });
    while (rows.length < ri + grid.length) rows.push({ id: uid(), cells: [] });
    rows = rows.map((r) => ({
      ...r,
      cells: columns.map((c) => r.cells.find((x) => x.columnId === c.id) ?? ({ columnId: c.id, cellType: "texto", editable: false, content: "" } as FormTableCell)),
    }));
    grid.forEach((line, gr) =>
      line.forEach((val, gc) => {
        const col = columns[ci + gc]!;
        const row = rows[ri + gr]!;
        row.cells = row.cells.map((c) => (c.columnId === col.id && (kindOf(c) === "label" || c.content === "" ) ? { ...c, editable: false, cellType: "texto", content: val.trim() } : c));
      }),
    );
    emit(rows, columns);
  }

  return (
    <div className="lc-table-wrap" ref={root}>
      <table className="runtime-table lc-table">
        <thead>
          <tr className="lc-colbar" aria-hidden="false">
            <th className="lc-gutter" />
            {cols.map((c, ci) => (
              <th key={c.id} className="lc-colbar__cell">
                <button type="button" title="Insertar columna a la derecha" onClick={() => addCol(ci)}>＋</button>
                <button type="button" title="Quitar columna" onClick={() => delCol(ci)} disabled={cols.length <= 1}>✕</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, ri) => (
            <tr
              key={r.id}
              className={dragRow === ri ? "lc-row lc-row--drag" : "lc-row"}
              onDragOver={(e) => { if (dragRow !== null) e.preventDefault(); }}
              onDrop={() => { if (dragRow !== null) move(dragRow, ri); setDragRow(null); }}
            >
              <td className="lc-gutter">
                <span className="lc-rowbar">
                  <span className="lc-grip" draggable title="Arrastra para reordenar" onDragStart={() => setDragRow(ri)} onDragEnd={() => setDragRow(null)}>⠿</span>
                  <button type="button" title="Insertar fila debajo" onClick={() => addRow(ri)}>＋</button>
                  <button type="button" title="Quitar fila" onClick={() => delRow(ri)} disabled={table.rows.length <= 1}>✕</button>
                </span>
              </td>
              {cols.map((col, ci) => {
                const cell = cellAt(r, col.id);
                const k = kindOf(cell);
                const key = `${ri}:${ci}`;
                const head = ri === 0 || ci === 0;
                const c = (cell ?? { columnId: col.id, cellType: "texto", editable: false, content: "" }) as FormTableCell;
                return (
                  <td key={col.id} className={`lc-cell lc-cell--${k}${head && k === "label" ? " lc-cell--head" : ""}`}>
                    <div className="lc-cell__box">
                      {k === "label" && (
                        <textarea
                          className="lc-input lc-text"
                          rows={1}
                          value={htmlLines(c.content ?? "")}
                          placeholder={ri === 0 || ci === 0 ? "Escribe…" : ""}
                          aria-label="Texto de la celda"
                          onChange={(e) => setCell(ri, col.id, (x) => ({ ...x, content: linesHtml(e.target.value) }))}
                          onPaste={(e) => {
                            const t = e.clipboardData.getData("text/plain");
                            if (/[\t\n]/.test(t.trim())) { e.preventDefault(); pasteGrid(ri, ci, t); }
                          }}
                        />
                      )}
                      {k === "text" && <input className="lc-input lc-input--ghost" disabled placeholder={c.content || "Respuesta de texto"} />}
                      {(k === "number" || k === "percent") && (
                        <span className="lc-numeric">
                          <input className="lc-input lc-input--ghost" disabled placeholder="0" />
                          <input
                            className="lc-unit"
                            value={c.unit ?? ""}
                            placeholder="unidad"
                            aria-label="Unidad"
                            onChange={(e) => setCell(ri, col.id, (x) => ({ ...x, unit: e.target.value || undefined }))}
                          />
                        </span>
                      )}
                      {k === "list" && (
                        <select className="lc-input" aria-label="Lista (vista previa)" defaultValue="">
                          <option value="">Elegir…</option>
                          {(c.options ?? []).map((o) => <option key={o.id} value={o.id}>{plainOf(o.label)}</option>)}
                        </select>
                      )}
                      {k === "check" && (
                        <label className="lc-check">
                          <input type="checkbox" disabled />
                          <input
                            className="lc-input"
                            value={c.checkboxLabel ?? ""}
                            aria-label="Texto de la casilla"
                            onChange={(e) => setCell(ri, col.id, (x) => ({ ...x, checkboxLabel: e.target.value }))}
                          />
                        </label>
                      )}
                      {k === "mixed" && <MixedCell cell={c} onChange={(comps) => setCell(ri, col.id, (x) => ({ ...x, components: comps }))} />}
                      {k === "special" && <span className="lc-special">{plainOf(c.content ?? "") || "Celda especial"}</span>}
                      <button type="button" className="lc-cell__kind" title="¿Qué va en esta celda?" aria-label="Cambiar el contenido de la celda" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPos({ top: Math.min(r.bottom + 4, window.innerHeight - 330), left: Math.max(8, Math.min(r.left - 200, window.innerWidth - 300)) }); setMenu(menu === key ? null : key); }}>⌄</button>
                    </div>
                    {menu === key && (
                      <div className="lc-menu" role="menu" style={{ top: pos.top, left: pos.left }}>
                        <div className="lc-menu__title">¿Qué va en esta celda?</div>
                        {(["label", "text", "number", "percent", "list", "check", "mixed"] as Kind[]).map((opt) => (
                          <button key={opt} type="button" role="menuitemradio" aria-checked={k === opt} className={k === opt ? "is-on" : ""} onClick={() => setCell(ri, col.id, (x) => applyKind(x, opt))}>
                            {KIND_NAME[opt]}
                          </button>
                        ))}
                        {k === "special" && <div className="lc-menu__note">Esta celda tiene una configuración especial; elige otra opción para reemplazarla.</div>}
                        {k === "list" && (
                          <label className="lc-menu__opts">
                            Opciones de la lista (una por línea)
                            <textarea
                              rows={4}
                              defaultValue={(c.options ?? []).map((o) => plainOf(o.label)).join("\n")}
                              onBlur={(e) => {
                                const lines = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
                                if (!lines.length) return;
                                setCell(ri, col.id, (x) => ({ ...x, options: lines.map((l, i) => ({ id: x.options?.[i]?.id ?? uid(), label: toLabel(l) })) }));
                              }}
                            />
                          </label>
                        )}
                        {k === "text" && (
                          <label className="lc-menu__opts">
                            Texto guía (opcional)
                            <input value={c.content ?? ""} onChange={(e) => setCell(ri, col.id, (x) => ({ ...x, content: e.target.value || undefined }))} />
                          </label>
                        )}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="lc-ghost" onClick={() => addRow(table.rows.length - 1)}>＋ Fila</button>
    </div>
  );
}

/* ───────────── opciones reales (radio / casilla / lista) ───────────── */

type Opt = {
  id: string;
  label: string;
  subOptions?: { id: string; label: string }[] | undefined;
  subOptionsExclusive?: boolean;
  table?: TablaDatosConfig | undefined;
  references?: object | undefined;
  [k: string]: unknown;
};

function newTable(): TablaDatosConfig {
  const c1 = uid(), c2 = uid();
  return {
    columns: [{ id: c1 }, { id: c2 }],
    rows: [
      { id: uid(), cells: [{ columnId: c1, cellType: "texto", editable: false, content: "" }, { columnId: c2, cellType: "texto", editable: false, content: "" }] },
      { id: uid(), cells: [{ columnId: c1, cellType: "texto", editable: false, content: "" }, { columnId: c2, cellType: "numero" }] },
    ],
  };
}

function RefChip({ max, onChange, onRemove }: { max: number; onChange: (n: number) => void; onRemove: () => void }) {
  return (
    <div className="lc-ref">
      🔗 Enlaces o documentos de respaldo · máx.
      <input type="number" min={1} value={max} aria-label="Máximo de enlaces" onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))} />
      <button type="button" className="lc-ghost" aria-label="Quitar enlaces" onClick={onRemove}>✕</button>
    </div>
  );
}

function OptionsCanvas({ el, onChange }: { el: Extract<FormElement, { options: unknown }>; onChange: (patch: Partial<FormElement>) => void }) {
  const opts = el.options as unknown as Opt[];
  const mark = el.type === "seleccion_unica" ? "radio" : el.type === "seleccion_multiple" ? "checkbox" : "list";
  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (focusId) { refs.current[focusId]?.focus(); setFocusId(null); }
  }, [focusId, opts]);

  const set = (next: Opt[]) => onChange({ options: next } as Partial<FormElement>);
  const patch = (id: string, p: Partial<Opt>) => set(opts.map((o) => (o.id === id ? { ...o, ...p } : o)));
  const addAfter = (id: string | null) => {
    const n: Opt = { id: uid(), label: "" };
    const i = id ? opts.findIndex((o) => o.id === id) : opts.length - 1;
    const next = [...opts];
    next.splice(i + 1, 0, n);
    set(next);
    setFocusId(n.id);
  };

  const qRefs = (el as { references?: { maxUrls?: number } }).references;
  return (
    <div className={`lc-options lc-options--${mark}`}>
      {mark !== "list" && (
        qRefs ? (
          <RefChip max={qRefs.maxUrls ?? 3} onChange={(n) => onChange({ references: { ...qRefs, maxUrls: n } } as Partial<FormElement>)} onRemove={() => onChange({ references: undefined } as Partial<FormElement>)} />
        ) : (
          <button type="button" className="lc-ghost" onClick={() => onChange({ references: { maxUrls: 3 } } as Partial<FormElement>)}>＋ Enlaces de respaldo</button>
        )
      )}
      {opts.map((o, oi) => (
        <div className="lc-option" key={o.id}>
          <div className="lc-option__row">
            {mark === "list" ? <span className="lc-n">{oi + 1}.</span> : <input type={mark} disabled tabIndex={-1} aria-hidden="true" />}
            <input
              ref={(n) => { refs.current[o.id] = n; }}
              className="lc-input lc-input--opt"
              value={plainOf(o.label)}
              placeholder={`Opción ${oi + 1}`}
              aria-label={`Opción ${oi + 1}`}
              onChange={(e) => patch(o.id, { label: toLabel(e.target.value) })}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addAfter(o.id); }
                else if (e.key === "Backspace" && plainOf(o.label) === "" && opts.length > 1) {
                  e.preventDefault();
                  const prev = opts[oi - 1] ?? opts[oi + 1];
                  set(opts.filter((x) => x.id !== o.id));
                  if (prev) setFocusId(prev.id);
                }
              }}
            />
            <span className="lc-option__tools">
              {mark !== "list" && !o.references && <button type="button" onClick={() => patch(o.id, { references: { maxUrls: 3 } })}>＋ Enlaces</button>}
              {mark !== "list" && !o.table && <button type="button" onClick={() => patch(o.id, { table: newTable() })}>＋ Tabla</button>}
              {mark !== "list" && !o.subOptions?.length && <button type="button" onClick={() => patch(o.id, { subOptions: [{ id: uid(), label: "" }] })}>＋ Casillas</button>}
              <button type="button" aria-label={`Quitar opción ${oi + 1}`} disabled={opts.length <= 1} onClick={() => set(opts.filter((x) => x.id !== o.id))}>✕</button>
            </span>
          </div>

          {o.references && (
            <div className="lc-sub">
              <RefChip max={(o.references as { maxUrls?: number }).maxUrls ?? 3} onChange={(n) => patch(o.id, { references: { ...(o.references as object), maxUrls: n } })} onRemove={() => patch(o.id, { references: undefined })} />
            </div>
          )}

          {o.subOptions && o.subOptions.length > 0 && (
            <div className="lc-sub">
              {o.subOptions.map((s, si) => (
                <div className="lc-sub__row" key={s.id}>
                  <input type={o.subOptionsExclusive ? "radio" : "checkbox"} disabled tabIndex={-1} aria-hidden="true" />
                  <input
                    className="lc-input"
                    value={plainOf(s.label)}
                    placeholder="Texto de la casilla"
                    aria-label={`Casilla ${si + 1}`}
                    onChange={(e) => patch(o.id, { subOptions: o.subOptions!.map((x) => (x.id === s.id ? { ...x, label: toLabel(e.target.value) } : x)) })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const subs = [...o.subOptions!];
                        subs.splice(si + 1, 0, { id: uid(), label: "" });
                        patch(o.id, { subOptions: subs });
                      } else if (e.key === "Backspace" && plainOf(s.label) === "") {
                        e.preventDefault();
                        const subs = o.subOptions!.filter((x) => x.id !== s.id);
                        patch(o.id, { subOptions: subs.length ? subs : undefined });
                      }
                    }}
                  />
                </div>
              ))}
              <button type="button" className="lc-ghost" onClick={() => patch(o.id, { subOptions: [...o.subOptions!, { id: uid(), label: "" }] })}>＋ Casilla</button>
            </div>
          )}

          {o.table && (
            <div className="lc-nested">
              <TableCanvas table={o.table} onChange={(t) => patch(o.id, { table: t })} />
              <button type="button" className="lc-ghost lc-ghost--danger" onClick={() => patch(o.id, { table: undefined })}>Quitar la tabla de esta opción</button>
            </div>
          )}
        </div>
      ))}
      <button type="button" className="lc-ghost" onClick={() => addAfter(null)}>＋ Opción</button>
    </div>
  );
}

/* ───────────── entrada ───────────── */

export function LiveCanvas({ el, onChange }: { el: FormElement; onChange: (patch: Partial<FormElement>) => void }) {
  if (el.type === "seleccion_unica" || el.type === "seleccion_multiple" || el.type === "seleccion_desplegable") {
    return <OptionsCanvas el={el} onChange={onChange} />;
  }
  if (el.type === "tabla_datos") {
    return <TableCanvas table={{ columns: el.columns, rows: el.rows }} onChange={(t) => onChange({ columns: t.columns, rows: t.rows } as Partial<FormElement>)} />;
  }
  return null;
}

export const canvasHandles = (el: FormElement) =>
  el.type === "seleccion_unica" || el.type === "seleccion_multiple" || el.type === "seleccion_desplegable" || el.type === "tabla_datos";

/* Controles de respuesta simples, tal como los ve el evaluado (vista de maqueta, no editable salvo la unidad). */
export function AnswerPreview({ el, onChange }: { el: FormElement; onChange: (patch: Partial<FormElement>) => void }) {
  switch (el.type) {
    case "texto_corto":
      return <input className="lc-answer" disabled placeholder="Respuesta corta" aria-hidden="true" tabIndex={-1} />;
    case "texto_largo":
      return <textarea className="lc-answer" disabled rows={3} placeholder="Respuesta larga" aria-hidden="true" tabIndex={-1} />;
    case "fecha":
      return <input className="lc-answer lc-answer--short" type="date" disabled aria-hidden="true" tabIndex={-1} />;
    case "numero":
      return (
        <span className="lc-numeric lc-numeric--q">
          <input className="lc-answer lc-answer--short" disabled placeholder="0" aria-hidden="true" tabIndex={-1} />
          <input
            className="lc-unit"
            value={el.unit ?? ""}
            placeholder="unidad"
            aria-label="Unidad"
            onChange={(e) => onChange({ unit: e.target.value === "" ? undefined : e.target.value } as Partial<FormElement>)}
          />
        </span>
      );
    case "evidencia":
      return <div className="lc-answer lc-answer--drop">📎 El evaluado adjunta aquí sus archivos</div>;
    case "url_publica":
      return <input className="lc-answer" disabled placeholder="https://" aria-hidden="true" tabIndex={-1} />;
    case "calculado":
      return <div className="lc-answer lc-answer--drop">Resultado calculado automáticamente</div>;
    default:
      return null;
  }
}
