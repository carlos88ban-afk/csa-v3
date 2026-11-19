"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

interface Unit {
  id: string;
  name: string;
  sigla: string | null;
  active: boolean;
}
interface UnitsData {
  units: Unit[];
  corporateOrgId: string | null;
}

let cache: Promise<UnitsData> | null = null;
function loadUnits(): Promise<UnitsData> {
  cache ??= api
    .get<{ units: Unit[]; corporateOrgId?: string }>("/api/units")
    .then((r) => ({ units: r.units.filter((u) => u.active), corporateOrgId: r.corporateOrgId ?? null }));
  return cache;
}

// "Aplica a" / "Quién responde": casillas por unidad de negocio y, aparte, el
// Corporativo (VS-080). Sin restricción (undefined) = todas las unidades y NO el
// corporativo: el corporativo solo responde lo que lo nombra explícitamente.
export function AppliesToPicker({
  value,
  onChange,
  label = "Aplica a",
}: {
  value: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
  label?: string;
}) {
  const [data, setData] = useState<UnitsData>({ units: [], corporateOrgId: null });
  useEffect(() => {
    void loadUnits().then(setData);
  }, []);
  const { units, corporateOrgId } = data;
  if (units.length === 0) return null;

  const selected = new Set(value ?? units.map((u) => u.id));
  const corpOn = !!corporateOrgId && !!value && value.includes(corporateOrgId);
  function emit(unitIds: Set<string>, corp: boolean) {
    if (!corp && unitIds.size === units.length) return onChange(undefined);
    onChange([...unitIds, ...(corp && corporateOrgId ? [corporateOrgId] : [])]);
  }
  function toggle(id: string) {
    const next = new Set([...selected].filter((x) => x !== corporateOrgId));
    if (next.has(id)) next.delete(id);
    else next.add(id);
    emit(next, corpOn);
  }

  return (
    <fieldset className="applies">
      <legend className="applies__label">{label}</legend>
      {corporateOrgId && (
        <label className={`applies__chip applies__chip--corp${corpOn ? " applies__chip--on" : ""}`}>
          <input type="checkbox" checked={corpOn} onChange={() => emit(new Set(units.filter((u) => selected.has(u.id)).map((u) => u.id)), !corpOn)} />
          <span>Corporativo</span>
        </label>
      )}
      {units.map((u) => (
        <label key={u.id} className={`applies__chip${selected.has(u.id) ? " applies__chip--on" : ""}`}>
          <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
          <span>{u.sigla || u.name}</span>
        </label>
      ))}
    </fieldset>
  );
}
