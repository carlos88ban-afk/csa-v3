import { describe, expect, it } from "vitest";
import { condition, isElementVisible } from "./rule.js";

describe("condition", () => {
  it.each([
    { elementId: "1", operator: "equals", value: "x" },
    { elementId: "1", operator: "notEquals", value: 5 },
    { elementId: "1", operator: "contains", value: "a" },
    { elementId: "1", operator: "isAnswered" },
    { elementId: "1", operator: "isEmpty" },
    { elementId: "1", operator: "isAnswered", value: "x" },
  ])("acepta una condición válida con $operator", (c) => {
    expect(condition.safeParse(c).success).toBe(true);
  });

  it("rechaza elementId vacío", () => {
    expect(condition.safeParse({ elementId: "", operator: "isAnswered" }).success).toBe(false);
  });

  it("rechaza un operator desconocido", () => {
    expect(condition.safeParse({ elementId: "1", operator: "equalsX" }).success).toBe(false);
  });

  it("rechaza un value de tipo objeto", () => {
    expect(condition.safeParse({ elementId: "1", operator: "equals", value: {} }).success).toBe(false);
  });
});

describe("isElementVisible", () => {
  it("sin condición devuelve true (siempre visible)", () => {
    expect(isElementVisible(undefined, {})).toBe(true);
  });

  it("equals con match devuelve true", () => {
    expect(isElementVisible({ elementId: "1", operator: "equals", value: "x" }, { "1": "x" })).toBe(true);
  });

  it("equals sin match devuelve false", () => {
    expect(isElementVisible({ elementId: "1", operator: "equals", value: "x" }, { "1": "y" })).toBe(false);
  });

  it("equals no aplica a arrays (devuelve false)", () => {
    expect(isElementVisible({ elementId: "1", operator: "equals", value: "x" }, { "1": ["x"] })).toBe(false);
  });

  it("notEquals con valores iguales devuelve false", () => {
    expect(isElementVisible({ elementId: "1", operator: "notEquals", value: "x" }, { "1": "x" })).toBe(false);
  });

  it("notEquals con valores distintos devuelve true", () => {
    expect(isElementVisible({ elementId: "1", operator: "notEquals", value: "x" }, { "1": "y" })).toBe(true);
  });

  it("notEquals con valor array devuelve true (son distintos)", () => {
    expect(isElementVisible({ elementId: "1", operator: "notEquals", value: "x" }, { "1": ["x"] })).toBe(true);
  });

  it("contains con array que incluye el valor devuelve true", () => {
    expect(isElementVisible({ elementId: "1", operator: "contains", value: "a" }, { "1": ["a", "b"] })).toBe(true);
  });

  it("contains con array que no incluye el valor devuelve false", () => {
    expect(isElementVisible({ elementId: "1", operator: "contains", value: "c" }, { "1": ["a", "b"] })).toBe(false);
  });

  it("contains cuando el valor guardado no es un array devuelve false", () => {
    expect(isElementVisible({ elementId: "1", operator: "contains", value: "a" }, { "1": "abc" })).toBe(false);
  });

  it.each([
    { label: "string no vacío", answer: "x" },
    { label: "número", answer: 5 },
    { label: "array no vacío", answer: ["a"] },
  ])("isAnswered con respuesta ($label) devuelve true", ({ answer }) => {
    expect(isElementVisible({ elementId: "1", operator: "isAnswered" }, { "1": answer })).toBe(true);
  });

  it.each([
    { label: "clave ausente", answer: undefined },
    { label: "string vacío", answer: "" },
    { label: "array vacío", answer: [] },
  ])("isAnswered sin respuesta ($label) devuelve false", ({ answer }) => {
    const answers = answer === undefined ? {} : { "1": answer };
    expect(isElementVisible({ elementId: "1", operator: "isAnswered" }, answers)).toBe(false);
  });

  it("isEmpty es la negación exacta de isAnswered", () => {
    expect(isElementVisible({ elementId: "1", operator: "isEmpty" }, { "1": "x" })).toBe(false);
    expect(isElementVisible({ elementId: "1", operator: "isEmpty" }, { "1": 5 })).toBe(false);
    expect(isElementVisible({ elementId: "1", operator: "isEmpty" }, { "1": ["a"] })).toBe(false);
    expect(isElementVisible({ elementId: "1", operator: "isEmpty" }, {})).toBe(true);
    expect(isElementVisible({ elementId: "1", operator: "isEmpty" }, { "1": "" })).toBe(true);
    expect(isElementVisible({ elementId: "1", operator: "isEmpty" }, { "1": [] })).toBe(true);
  });
});
