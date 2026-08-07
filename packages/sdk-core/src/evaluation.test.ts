import { describe, expect, it } from "vitest";
import {
  createEvaluationInput,
  dimensionNumber,
  directSubindicatorNumber,
  evaluationSnapshot,
  indicatorNumber,
  subindicatorNumber,
} from "./evaluation.js";

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
        subindicators: [],
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

  it("acepta subindicadores directos bajo dimensión, sin indicador intermedio (VS-029)", () => {
    const direct = {
      frameworkName: "x",
      frameworkDescription: null,
      dimensions: [
        {
          id: "dim-0",
          title: "Company Information",
          description: null,
          indicators: [],
          subindicators: [
            { id: "sub-0.1", title: "Denominator - Revenues", description: null, formSchema: null, revisionNumber: 1 },
          ],
        },
      ],
    };
    expect(evaluationSnapshot.safeParse(direct).success).toBe(true);
  });

  it("rechaza una dimensión sin el campo subindicators (VS-029)", () => {
    const missing = {
      frameworkName: "x",
      frameworkDescription: null,
      dimensions: [{ id: "dim-1", title: "Dimensión 1", description: null, indicators: [] }],
    };
    expect(evaluationSnapshot.safeParse(missing).success).toBe(false);
  });
});

describe("numeración automática (VS-021)", () => {
  it("dimensionNumber es 1-based", () => {
    expect(dimensionNumber(0)).toBe("1");
    expect(dimensionNumber(2)).toBe("3");
  });

  it("indicatorNumber compone dimensión.indicador", () => {
    expect(indicatorNumber(0, 0)).toBe("1.1");
    expect(indicatorNumber(2, 4)).toBe("3.5");
  });

  it("subindicatorNumber compone dimensión.indicador.subindicador", () => {
    expect(subindicatorNumber(0, 0, 0)).toBe("1.1.1");
    expect(subindicatorNumber(1, 3, 2)).toBe("2.4.3");
  });

  it("directSubindicatorNumber numera después de los indicadores de la dimensión (VS-029)", () => {
    expect(directSubindicatorNumber(0, 0, 0)).toBe("1.1");
    expect(directSubindicatorNumber(0, 3, 0)).toBe("1.4");
    expect(directSubindicatorNumber(4, 2, 1)).toBe("5.4");
  });
});
