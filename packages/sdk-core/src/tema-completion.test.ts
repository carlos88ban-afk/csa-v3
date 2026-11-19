import { describe, expect, it } from "vitest";
import { temaCompletion } from "./completion.js";
import type { FormElement } from "./form-schema.js";

const el = (o: Record<string, unknown>) => ({ componentVersion: 1, ...o }) as unknown as FormElement;

describe("temaCompletion: un tema cuenta como una pregunta", () => {
  const q = el({ id: "q", type: "texto_corto", label: "q" });
  const ev = el({ id: "e", type: "evidencia", label: "e" });
  it("la evidencia opcional no cuenta cuando hay otra pregunta", () => {
    expect(temaCompletion([q, ev], { q: "hola" })).toBe("complete");
    expect(temaCompletion([q, ev], {})).toBe("empty");
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
