import { describe, expect, it } from "vitest";
import { createEvaluationInput, evaluationSnapshot } from "./evaluation.js";

describe("createEvaluationInput", () => {
  it("acepta un frameworkId válido", () => {
    expect(createEvaluationInput.safeParse({ frameworkId: "fw-1" }).success).toBe(true);
  });

  it("rechaza sin frameworkId", () => {
    expect(createEvaluationInput.safeParse({}).success).toBe(false);
  });
});

describe("evaluationSnapshot", () => {
  const valid = {
    frameworkName: "Framework Demo",
    frameworkDescription: null,
    dimensions: [
      {
        id: "dim-1",
        title: "Dimensión 1",
        description: null,
        indicators: [
          {
            id: "ind-1",
            title: "Indicador 1",
            description: null,
            subindicators: [
              {
                id: "sub-1",
                title: "Subindicador 1",
                description: null,
                formSchema: {
                  schemaVersion: 1,
                  elements: [{ id: "el-1", type: "instruccion", label: "Lea con atención" }],
                },
                revisionNumber: 2,
              },
            ],
          },
        ],
      },
    ],
  };

  it("acepta un snapshot completo válido", () => {
    expect(evaluationSnapshot.safeParse(valid).success).toBe(true);
  });

  it("acepta formSchema null (subindicador nunca editado)", () => {
    const withNull = {
      ...valid,
      dimensions: [
        {
          ...valid.dimensions[0],
          indicators: [
            { ...valid.dimensions[0]!.indicators[0]!, subindicators: [{ ...valid.dimensions[0]!.indicators[0]!.subindicators[0]!, formSchema: null }] },
          ],
        },
      ],
    };
    expect(evaluationSnapshot.safeParse(withNull).success).toBe(true);
  });

  it("acepta un árbol sin dimensiones (framework recién creado)", () => {
    expect(evaluationSnapshot.safeParse({ frameworkName: "x", frameworkDescription: null, dimensions: [] }).success).toBe(true);
  });

  it("rechaza un formSchema con forma inválida dentro del snapshot", () => {
    const invalid = {
      ...valid,
      dimensions: [
        {
          ...valid.dimensions[0],
          indicators: [
            {
              ...valid.dimensions[0]!.indicators[0]!,
              subindicators: [
                { ...valid.dimensions[0]!.indicators[0]!.subindicators[0]!, formSchema: { schemaVersion: 2, elements: [] } },
              ],
            },
          ],
        },
      ],
    };
    expect(evaluationSnapshot.safeParse(invalid).success).toBe(false);
  });
});
