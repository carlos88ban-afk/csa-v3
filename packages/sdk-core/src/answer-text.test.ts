import { describe, expect, it } from "vitest";
import { splitAnswerText } from "./answer-text.js";

describe("splitAnswerText", () => {
  it("separa la frase de la tabla y estructura filas/columnas", () => {
    const r = splitAnswerText("Sí, informa (Tabla: Fila 2: Problema=Clima, Gasto=1250; Fila 3: Problema=Agua, Gasto=300)");
    expect(r.lead).toBe("Sí, informa");
    expect(r.tables).toHaveLength(1);
    expect(r.tables[0]!.headers).toEqual(["Problema", "Gasto"]);
    expect(r.tables[0]!.rows).toHaveLength(2);
    expect(r.tables[0]!.rows[1]!.cells["Gasto"]).toBe("300");
  });
  it("soporta varias tablas y texto posterior", () => {
    const r = splitAnswerText("Opción (Tabla: Fila 2: A=1) (Tabla 2: Fila 2: B=2) — Sub uno");
    expect(r.tables.map((t) => t.title)).toEqual(["Tabla", "Tabla 2"]);
    expect(r.lead).toBe("Opción — Sub uno");
  });
  it("una coma dentro de un valor no parte la celda", () => {
    const r = splitAnswerText("X (Tabla: Fila 2: Nombre=Pérez, Juan, Edad=30)");
    expect(r.tables[0]!.rows[0]!.cells["Nombre"]).toBe("Pérez, Juan");
  });
  it("sin tablas deja el texto intacto", () => {
    expect(splitAnswerText("Solo texto")).toEqual({ lead: "Solo texto", tables: [] });
  });
});
