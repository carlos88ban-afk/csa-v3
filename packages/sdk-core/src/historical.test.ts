import { describe, expect, it } from "vitest";
import { consolidateHistorical, resolveHistoricalForUnit } from "./historical.js";

const cell = (extra: object = {}) => ({ columnId: "c1", cellType: "numero", ...extra });

describe("resolveHistoricalForUnit", () => {
  const formSchema = {
    elements: [
      { id: "t", type: "tabla_datos", rows: [{ id: "r", cells: [cell({ historical: { A: 10, B: 7 } }), cell()] }] },
      { id: "q", type: "seleccion_unica", options: [{ id: "o", table: { rows: [{ id: "r", cells: [cell({ historical: { A: "x", B: "y" } })] }] } }] },
    ],
  };

  it("deja solo el valor de la unidad y nunca el de las demás", () => {
    const out = resolveHistoricalForUnit(formSchema, "A");
    expect(JSON.stringify(out)).not.toContain('"historical"');
    expect(JSON.stringify(out)).not.toContain('"y"');
    expect((out.elements[0] as any).rows[0].cells[0].historicalValue).toBe(10);
    expect((out.elements[1] as any).options[0].table.rows[0].cells[0].historicalValue).toBe("x");
  });
  it("una unidad sin histórico no recibe nada (ni el de otras)", () => {
    const out = resolveHistoricalForUnit(formSchema, "C");
    expect(JSON.stringify(out)).not.toContain("historical");
  });
  it("descarta un historicalValue que venga ya escrito (no se puede falsificar)", () => {
    const out = resolveHistoricalForUnit({ rows: [{ cells: [cell({ historicalValue: 999 })] }] }, "A");
    expect(JSON.stringify(out)).not.toContain("999");
  });
  it("no muta la entrada", () => {
    const copy = JSON.stringify(formSchema);
    resolveHistoricalForUnit(formSchema, "A");
    expect(JSON.stringify(formSchema)).toBe(copy);
  });
});

describe("consolidateHistorical", () => {
  it("suma numéricos, incluso como texto", () => expect(consolidateHistorical({ A: 10, B: "5,5" })).toBe(15.5));
  it("null si hay texto no numérico o está vacío", () => {
    expect(consolidateHistorical({ A: 10, B: "n/d" })).toBeNull();
    expect(consolidateHistorical(undefined)).toBeNull();
    expect(consolidateHistorical({ A: "" })).toBeNull();
  });
});
