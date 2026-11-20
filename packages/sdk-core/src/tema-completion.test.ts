import { describe, expect, it } from "vitest";
import { temaCompletion, temaLevel } from "./completion.js";
import type { FormElement } from "./form-schema.js";

const el = (o: Record<string, unknown>) => ({ componentVersion: 1, ...o }) as unknown as FormElement;

describe("temaCompletion: un tema cuenta como una pregunta", () => {
  const q = el({ id: "q", type: "texto_corto", label: "q" });
  const ev = el({ id: "e", type: "evidencia", label: "e" });
  it("respondida sin evidencia es parcial (3 cuadritos); con evidencia, completa", () => {
    expect(temaCompletion([q, ev], { q: "hola" })).toBe("partial");
    expect(temaLevel([q, ev], { q: "hola" })).toBe(3);
    expect(temaLevel([q, ev], { q: "hola", e: [{ key: "k", name: "a.pdf", size: 1, mimeType: "x" }] as never })).toBe(4);
    expect(temaCompletion([q, ev], {})).toBe("empty");
    expect(temaLevel([q, ev], {})).toBe(1);
  });
  it("sin evidencia en el tema, responder basta (4)", () => {
    expect(temaLevel([q], { q: "hola" })).toBe(4);
  });
  it("si solo hay evidencia, esa es la pregunta", () => {
    expect(temaCompletion([ev], {})).toBe("empty");
  });
  it("sin preguntas devuelve null", () => {
    expect(temaCompletion([el({ id: "i", type: "instruccion", label: "x" })], {})).toBeNull();
  });
  it("las de solo lectura del corporativo no cuentan", () => {
    expect(temaCompletion([{ ...q, viewerReadOnly: true } as FormElement], {})).toBeNull();
  });
});
