import { describe, expect, it } from "vitest";
import { formElement, formSchema } from "./form-schema.js";

describe("formElement", () => {
  it.each([
    { type: "texto_corto", id: "1", label: "Nombre" },
    { type: "texto_largo", id: "2", label: "Comentarios", maxLength: 500 },
    { type: "numero", id: "3", label: "Edad", min: 0, max: 120 },
    {
      type: "seleccion_unica",
      id: "4",
      label: "Género",
      options: [{ id: "a", label: "A" }],
    },
    {
      type: "seleccion_multiple",
      id: "5",
      label: "Intereses",
      options: [{ id: "a", label: "A" }],
      minSelected: 0,
      maxSelected: 3,
    },
    { type: "instruccion", id: "6", label: "Lea con atención" },
    { type: "banner", id: "7", label: "Aviso importante", variant: "warning" },
    { type: "evidencia", id: "8", label: "Adjunte su certificado", maxFiles: 3, maxSizeMb: 10, acceptedTypes: ["pdf", "png"] },
  ])("acepta un elemento válido de tipo $type", (element) => {
    expect(formElement.safeParse(element).success).toBe(true);
  });

  it("rechaza un type desconocido", () => {
    const result = formElement.safeParse({ id: "1", type: "tabla", label: "x" });
    expect(result.success).toBe(false);
  });

  it("rechaza seleccion_unica sin options", () => {
    const result = formElement.safeParse({ id: "1", type: "seleccion_unica", label: "x", options: [] });
    expect(result.success).toBe(false);
  });

  it("rechaza banner sin variant", () => {
    const result = formElement.safeParse({ id: "1", type: "banner", label: "x" });
    expect(result.success).toBe(false);
  });

  it("rechaza evidencia con maxFiles no entero", () => {
    const result = formElement.safeParse({ id: "1", type: "evidencia", label: "x", maxFiles: 1.5 });
    expect(result.success).toBe(false);
  });

  it("rechaza evidencia con maxSizeMb negativo", () => {
    const result = formElement.safeParse({ id: "1", type: "evidencia", label: "x", maxSizeMb: -1 });
    expect(result.success).toBe(false);
  });

  it("rechaza un elemento sin id", () => {
    const result = formElement.safeParse({ type: "texto_corto", label: "x" });
    expect(result.success).toBe(false);
  });
});

describe("formSchema", () => {
  it("acepta un schema válido con varios elementos", () => {
    const result = formSchema.safeParse({
      schemaVersion: 1,
      elements: [
        { id: "1", type: "instruccion", label: "Lea con atención" },
        { id: "2", type: "texto_corto", label: "Nombre", required: true },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("acepta una lista de elementos vacía", () => {
    expect(formSchema.safeParse({ schemaVersion: 1, elements: [] }).success).toBe(true);
  });

  it("rechaza un schemaVersion distinto de 1", () => {
    expect(formSchema.safeParse({ schemaVersion: 2, elements: [] }).success).toBe(false);
  });

  it("rechaza un elemento inválido dentro de elements", () => {
    const result = formSchema.safeParse({
      schemaVersion: 1,
      elements: [{ id: "1", type: "desconocido", label: "x" }],
    });
    expect(result.success).toBe(false);
  });
});
