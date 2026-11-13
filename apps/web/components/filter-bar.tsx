"use client";

import { Fragment, type ReactNode } from "react";

// Barra de filtros compartida (VS-034): búsqueda + filtros + contador, fija bajo la barra superior.

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** ¿Algún campo contiene todas las palabras buscadas? */
export function matchesText(query: string, ...fields: Array<string | null | undefined>) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = norm(fields.filter(Boolean).join(" "));
  return words.every((w) => hay.includes(w));
}

/** Resalta las palabras buscadas dentro de un texto. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0 || !text) return <>{text}</>;
  // norm() conserva la longitud (NFD + quitar marcas puede acortar): se marca sobre el texto normalizado carácter a carácter.
  const flat = [...text].map((ch) => norm(ch) || ch);
  const marks = new Array(flat.length).fill(false);
  const joined = flat.join("");
  const offsets: number[] = [];
  flat.forEach((f, i) => { for (let k = 0; k < f.length; k++) offsets.push(i); });
  for (const w of words) {
    let from = 0;
    for (;;) {
      const at = joined.indexOf(w, from);
      if (at === -1) break;
      for (let k = at; k < at + w.length; k++) marks[offsets[k]!] = true;
      from = at + w.length;
    }
  }
  const chars = [...text];
  const out: ReactNode[] = [];
  let i = 0;
  while (i < chars.length) {
    let j = i;
    while (j < chars.length && marks[j] === marks[i]) j++;
    const piece = chars.slice(i, j).join("");
    out.push(marks[i] ? <mark key={i} className="fbar__mark">{piece}</mark> : <Fragment key={i}>{piece}</Fragment>);
    i = j;
  }
  return <>{out}</>;
}

export function FilterBar({
  query,
  onQuery,
  placeholder,
  shown,
  total,
  active,
  onClear,
  children,
}: {
  query: string;
  onQuery: (q: string) => void;
  placeholder: string;
  shown: number;
  total: number;
  active: boolean;
  onClear: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="fbar" role="search">
      <input
        type="search"
        className="fbar__search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {children}
      <span className="fbar__count" aria-live="polite">{shown} de {total}</span>
      {active && <button type="button" className="btn btn--secondary btn--sm" onClick={onClear}>Limpiar</button>}
    </div>
  );
}

export function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <p className="empty">
      Nada coincide con los filtros.{" "}
      <button type="button" className="btn btn--secondary btn--sm" onClick={onClear}>Limpiar filtros</button>
    </p>
  );
}
