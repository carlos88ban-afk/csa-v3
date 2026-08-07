import { describe, expect, it } from "vitest";
import { createSubindicatorInput } from "./domain.js";

// Subindicadores directos bajo Dimensión (VS-029, docs/domain/evaluation-hierarchy.md):
// indicatorId/dimensionId son alternativos, invariante XOR.
describe("createSubindicatorInput", () => {
  it("acepta con indicatorId (caso tradicional)", () => {
    const result = createSubindicatorInput.safeParse({ indicatorId: "ind-1", title: "Sub 1" });
    expect(result.success).toBe(true);
  });

  it("acepta con dimensionId (subindicador directo)", () => {
    const result = createSubindicatorInput.safeParse({ dimensionId: "dim-1", title: "Sub 1" });
    expect(result.success).toBe(true);
  });

  it("rechaza sin indicatorId ni dimensionId", () => {
    const result = createSubindicatorInput.safeParse({ title: "Sub 1" });
    expect(result.success).toBe(false);
  });

  it("rechaza con ambos indicatorId y dimensionId a la vez", () => {
    const result = createSubindicatorInput.safeParse({ indicatorId: "ind-1", dimensionId: "dim-1", title: "Sub 1" });
    expect(result.success).toBe(false);
  });

  it("rechaza sin title", () => {
    const result = createSubindicatorInput.safeParse({ indicatorId: "ind-1" });
    expect(result.success).toBe(false);
  });
});
