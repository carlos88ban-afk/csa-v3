"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

interface Unit {
  id: string;
  name: string;
  sigla: string | null;
  active: boolean;
}

let cache: Promise<Unit[]> | null = null;
function loadUnits(): Promise<Unit[]> {
  cache ??= api.get<{ units: Unit[] }>("/api/units").then((r) => r.units.filter((u) => u.active));
  return cache;
}

// "Aplica a": casillas por unidad de negocio. Sin restriccion (undefined) =
// todas las unidades.
export function AppliesToPicker({
  value,
  onChange,
}: {
  value: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
}) {
  const [units, setUnits] = useState<Unit[]>([]);
  useEffect(() => {
    void loadUnits().then(setUnits);
  }, []);
  if (units.length === 0) return null;

  const selected = new Set(value ?? units.map((u) => u.id));
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next.size === units.length ? undefined : [...next]);
  }

  return (
    <fieldset className="field">
      <legend className="field__label">Aplica a</legend>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {units.map((u) => (
          <label key={u.id} className="field--checkbox" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
            <span>{u.sigla || u.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
