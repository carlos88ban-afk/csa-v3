import { describe, expect, it } from "vitest";
import { componentRegistry, questionNumber } from "./component-registry.js";
import { formElement } from "./form-schema.js";

describe("componentRegistry", () => {
  it("tiene exactamente una entrada por tipo de formElement, sin duplicados", () => {
    const registryTypes = componentRegistry.map((c) => c.type).sort();
    const unionTypes = formElement.options.map((option) => option.shape.type.value).sort();
    expect(registryTypes).toEqual(unionTypes);
    expect(new Set(registryTypes).size).toBe(registryTypes.length);
  });

  it("toda entrada declara version >= 1", () => {
    for (const c of componentRegistry) {
      expect(c.version).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("questionNumber (VS-021)", () => {
  it("es 0-N, 1-based, reinicia en cada Subindicador", () => {
    expect(questionNumber(0)).toBe("0.1");
    expect(questionNumber(4)).toBe("0.5");
  });
});
