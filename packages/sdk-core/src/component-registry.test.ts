import { describe, expect, it } from "vitest";
import { componentRegistry } from "./component-registry.js";
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
