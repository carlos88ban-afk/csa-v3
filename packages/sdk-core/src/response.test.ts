import { describe, expect, it } from "vitest";
import { answerValue, responseAnswers, upsertResponseInput } from "./response.js";

describe("answerValue", () => {
  it.each(["texto", 42, ["a", "b"]])("acepta un valor válido de tipo %s", (value) => {
    expect(answerValue.safeParse(value).success).toBe(true);
  });

  it("rechaza un objeto anidado como valor", () => {
    const result = answerValue.safeParse({ text: "x" });
    expect(result.success).toBe(false);
  });

  it("rechaza un array de números", () => {
    const result = answerValue.safeParse([1, 2, 3]);
    expect(result.success).toBe(false);
  });
});

describe("responseAnswers", () => {
  it("acepta un mapa con varias claves", () => {
    const result = responseAnswers.safeParse({
      q1: "texto",
      q2: 5,
      q3: ["a", "b"],
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un mapa con un valor inválido", () => {
    const result = responseAnswers.safeParse({ q1: { anidado: true } });
    expect(result.success).toBe(false);
  });
});

describe("upsertResponseInput", () => {
  it("acepta un input válido con answers", () => {
    const result = upsertResponseInput.safeParse({ answers: { q1: "ok" } });
    expect(result.success).toBe(true);
  });

  it("rechaza un input sin la clave answers", () => {
    const result = upsertResponseInput.safeParse({});
    expect(result.success).toBe(false);
  });
});
