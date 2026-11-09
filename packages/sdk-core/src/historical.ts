// Dato histórico por unidad de negocio (ver docs/engines/form.md "Datos históricos").
// El admin carga `cell.historical` (unitId → valor) en el Builder; al armar la
// evaluación de UNA unidad el servidor deja solo `historicalValue` (el de esa unidad).

export type HistoricalMap = Record<string, string | number>;

/**
 * Reemplaza `historical` (todas las unidades) por `historicalValue` (solo la de
 * `unitId`) en cualquier celda de tabla, a cualquier profundidad (tabla suelta,
 * tabla dentro de una opción, de una sub-opción…). Pura: no muta la entrada.
 */
export function resolveHistoricalForUnit<T>(value: T, unitId: string): T {
  if (Array.isArray(value)) return value.map((v) => resolveHistoricalForUnit(v, unitId)) as unknown as T;
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (k === "historical" || k === "historicalValue") continue; // nunca confiar en un valor ya resuelto
      out[k] = resolveHistoricalForUnit(v, unitId);
    }
    const hist = src.historical as HistoricalMap | undefined;
    if (hist && typeof src.columnId === "string") {
      const mine = hist[unitId];
      if (mine !== undefined && mine !== "") out.historicalValue = mine;
    }
    return out as T;
  }
  return value;
}

/** Vista consolidada: suma si todos los valores son numéricos; si no, null (se muestra el detalle). */
export function consolidateHistorical(hist: HistoricalMap | undefined): number | null {
  const vals = Object.values(hist ?? {}).filter((v) => v !== "");
  if (vals.length === 0) return null;
  let total = 0;
  for (const v of vals) {
    const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "."));
    if (!Number.isFinite(n)) return null;
    total += n;
  }
  return total;
}
