import { describe, expect, it } from "vitest";
import { formElement, normalizeCellComponents } from "./form-schema.js";
import { parsePastedText } from "./paste-parser.js";

// Celda compuesta como la entrega la página de CSA: texto + enlaces + campo con límite + lista + casillas.
const TXT = `¿Informa la empresa sobre los tres aspectos materiales?
○ Sí, la empresa informa. Indique dónde se puede consultar.
    | Aspectos | Número 1 | Número 2 |
    | Riesgo material ¦ Por favor, especifique el riesgo material que afecta al negocio | Se permiten un máximo de 3, solo URL públicas ¦ _____ ¦ 0 de un máximo de 200 caracteres ¦ Seleccione la categoría a la que pertenece el riesgo ¦ ▾ | ☐ La empresa expone el caso de negocio para este tema importante: ¦ Describa el caso ¦ _____ |
○ No, la empresa no informa.
`;

describe("celdas compuestas (texto + enlaces + campos + lista + casilla)", () => {
  const r = parsePastedText(TXT);
  const q = r[0]!.element as any;
  const row = q.options[0].table.rows[1];
  it("la etiqueta de la fila conserva todo su texto, sin recortar", () => {
    expect(row.cells[0].content).toContain("Riesgo material");
    expect(row.cells[0].content).toContain("que afecta al negocio");
    expect(row.cells[0].editable).toBe(false);
  });
  it("la celda se convierte en componentes independientes", () => {
    const comps = normalizeCellComponents(row.cells[1]);
    expect(comps.map((c) => c.type)).toEqual(["referencia", "texto_corto", "seleccion_desplegable"]);
    expect((comps[0] as any).references.maxUrls).toBe(3);
    expect((comps[1] as any).maxLength).toBe(200);
    expect((comps[2] as any).label).toContain("Seleccione la categoría");
  });
  it("casilla con su texto completo y campos siguientes", () => {
    const comps = normalizeCellComponents(row.cells[2]);
    expect(comps.map((c) => c.type)).toEqual(["casilla", "texto_fijo", "texto_corto"]);
    expect((comps[0] as any).checkboxLabel).toContain("caso de negocio para este tema importante");
  });
  it("avisa que las opciones de la lista hay que revisarlas y valida el schema", () => {
    expect(r[0]!.reason).toMatch(/revisa las opciones de 1 lista/);
    for (const p of r) expect(formElement.safeParse(p.element).success).toBe(true);
  });
});

describe("texto de la plataforma de origen al final", () => {
  it("ignora los comentarios confidenciales y todo lo que sigue", () => {
    const r = parsePastedText("¿Tiene política?\n○ Sí\n○ No\nComentarios adicionales confidenciales\n\nUtilice el campo de texto a continuación solo en los siguientes casos: (i) para describir cambios.\n\nReferencias añadidas por analistas en 2026\n");
    expect(r).toHaveLength(1);
    expect(r[0]!.element.type).toBe("seleccion_unica");
  });
});
