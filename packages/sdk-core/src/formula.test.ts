import { describe, expect, it } from "vitest";
import {
  FormulaSyntaxError,
  evaluateExpression,
  evaluateTableExpression,
  extractExpressionReferences,
  parseFormula,
} from "./formula.js";

describe("evaluateExpression", () => {
  it.each([
    { expression: "2 + 3", values: {}, expected: 5 },
    { expression: "2 + 3 * 4", values: {}, expected: 14 },
    { expression: "(2 + 3) * 4", values: {}, expected: 20 },
    { expression: "2 * 3 + 4", values: {}, expected: 10 },
    { expression: "10 - 2 - 3", values: {}, expected: 5 },
    { expression: "10 / 2 / 5", values: {}, expected: 1 },
    { expression: "{a} + {b}", values: { a: 10, b: 5 }, expected: 15 },
    { expression: "{a}+{b}", values: { a: 2, b: 3 }, expected: 5 },
    { expression: "{a} * 2", values: { a: 6 }, expected: 12 },
    { expression: "-{a}", values: { a: 7 }, expected: -7 },
    { expression: "-5", values: {}, expected: -5 },
    { expression: "2 * -3", values: {}, expected: -6 },
    { expression: "3.5 + 0.5", values: {}, expected: 4 },
    { expression: "0.2 * 5", values: {}, expected: 1 },
    { expression: "({a} + {b}) / 2", values: { a: 10, b: 4 }, expected: 7 },
  ])("evaluateExpression($expression) === $expected", ({ expression, values, expected }) => {
    expect(evaluateExpression(expression, values)).toBe(expected);
  });

  it.each([
    { expression: "{a} + {b}", values: { a: 10 } },
    { expression: "{a}", values: {} },
    { expression: "10 / 0", values: {} },
    { expression: "5 / {a}", values: { a: 0 } },
    { expression: "2 +", values: {} },
    { expression: "(2 + 3", values: {} },
    { expression: "{a", values: {} },
  ])("evaluateExpression($expression) devuelve undefined si no se puede calcular", ({ expression, values }) => {
    expect(evaluateExpression(expression, values)).toBeUndefined();
  });
});

describe("extractExpressionReferences", () => {
  it.each([
    { expression: "{a} + {b} * {a}", expected: ["a", "b"] },
    { expression: "{el-1} - {el-2}", expected: ["el-1", "el-2"] },
    { expression: "{a}", expected: ["a"] },
    { expression: "{a}+{b}", expected: ["a", "b"] },
    { expression: "({a} - {b}) / {a}", expected: ["a", "b"] },
    { expression: "3 + 4", expected: [] },
  ])("extractExpressionReferences($expression) === $expected", ({ expression, expected }) => {
    expect(extractExpressionReferences(expression)).toEqual(expected);
  });

  it("devuelve [] si la sintaxis es inválida (no lanza)", () => {
    expect(extractExpressionReferences("2 +")).toEqual([]);
  });

  it("devuelve [] si hay una referencia sin cerrar", () => {
    expect(extractExpressionReferences("{a + 3")).toEqual([]);
  });

  it("devuelve [] para una expresión vacía", () => {
    expect(extractExpressionReferences("")).toEqual([]);
  });
});

describe("parseFormula", () => {
  it.each([
    "2 + 3",
    "2 + 3 * 4",
    "(2 + 3) * 4",
    "-5",
    "{a}",
    "1.5 + 2.25",
    "{el-1} * 2",
    "  {a}  +  {b}  ",
  ])("acepta la expresión válida %s", (expression) => {
    expect(() => parseFormula(expression)).not.toThrow();
  });

  it("devuelve un nodo binario para '2 + 3'", () => {
    expect(parseFormula("2 + 3").kind).toBe("binary");
  });

  it("devuelve un nodo unario para '-5'", () => {
    expect(parseFormula("-5").kind).toBe("unary");
  });

  it("lanza FormulaSyntaxError para '(2 + 3'", () => {
    expect(() => parseFormula("(2 + 3")).toThrow(FormulaSyntaxError);
  });

  it("lanza FormulaSyntaxError para una expresión vacía", () => {
    expect(() => parseFormula("")).toThrow(FormulaSyntaxError);
  });

  it("lanza 'Paréntesis sin cerrar' para '(2 + 3'", () => {
    expect(() => parseFormula("(2 + 3")).toThrow("Paréntesis sin cerrar");
  });

  it("lanza 'Referencia sin cerrar' para '{a'", () => {
    expect(() => parseFormula("{a")).toThrow("Referencia sin cerrar");
  });

  it("lanza 'Token inesperado' para '2 3' (texto sobrante)", () => {
    expect(() => parseFormula("2 3")).toThrow("Token inesperado");
  });

  it("lanza 'Carácter no reconocido' para '2 & 3'", () => {
    expect(() => parseFormula("2 & 3")).toThrow("Carácter no reconocido");
  });

  it("lanza para '2 +' (expresión incompleta)", () => {
    expect(() => parseFormula("2 +")).toThrow(FormulaSyntaxError);
  });
});

// VS-047 (docs/engines/form.md "Editor de tabla_datos estilo grilla"):
// evaluateTableExpression reescrito — la versión de VS-043 indexaba
// valuesByRow por posición numérica con claves sintéticas que nunca
// calzaban con una referencia {rowId} real, y no tenía tests.
describe("evaluateTableExpression", () => {
  const table = {
    r1: { c1: 4 },
    r2: { c1: 6 },
    r3: { c1: 10, c2: 100 },
  };

  it("resuelve {rowId} contra la columna activa", () => {
    expect(evaluateTableExpression("{r1}+{r2}", "c1", table)).toBe(10);
  });

  it("resuelve {rowId.columnId} a una celda puntual, ignorando la columna activa", () => {
    expect(evaluateTableExpression("{r3.c2}", "c1", table)).toBe(100);
  });

  it("mezcla {rowId} y {rowId.columnId} en la misma expresión", () => {
    expect(evaluateTableExpression("{r1}+{r2}+{r3.c2}", "c1", table)).toBe(110);
  });

  it("undefined si falta la fila/celda referenciada", () => {
    expect(evaluateTableExpression("{r1}+{r9}", "c1", table)).toBeUndefined();
  });

  it("undefined si la expresión no parsea", () => {
    expect(evaluateTableExpression("{r1}+", "c1", table)).toBeUndefined();
  });
});
