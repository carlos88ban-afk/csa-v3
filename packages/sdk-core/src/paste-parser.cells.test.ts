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

describe("bloque de enlaces a nivel de pregunta", () => {
  it("la indicación 'máximo de N URL' pasa a ser el bloque de enlaces, no la ayuda", () => {
    const r = parsePastedText("¿El presidente es independiente?\n\nLas empresas que cotizan deben dar enlaces.\n\nSe permiten un máximo de 3, solo URL públicas.\n\n○ Sí\n○ No\n");
    const q = r[0]!.element as any;
    expect(q.references).toEqual({ maxUrls: 3 });
    expect(q.helpText).toContain("cotizan");
    expect(q.helpText ?? "").not.toMatch(/máximo de 3/);
  });
});

describe("varias tablas dentro de la misma opción", () => {
  it("una línea en blanco separa tablas; la segunda va en moreTables", () => {
    const r = parsePastedText("¿Informa?\n○ Sí\n    | A | B |\n    | x | #_____ |\n\n    | C | D |\n    | y | #_____ |\n○ No\n");
    const o = (r[0]!.element as any).options[0];
    expect(o.table.rows).toHaveLength(2);
    expect(o.moreTables).toHaveLength(1);
    expect(formElement.safeParse(r[0]!.element).success).toBe(true);
  });
});

describe("primera columna con campo de respuesta", () => {
  it("una celda de la primera columna con un campo es de respuesta, no etiqueta", () => {
    const r = parsePastedText("¿Informa?\n○ Sí\n    | Organización | Tipo | Importe |\n    | _____ ¦ 300 de un máximo de 1000 caracteres | ▾ | #_____ |\n○ No\n");
    const row = (r[0]!.element as any).options[0].table.rows[1];
    expect(row.cells[0].editable).toBe(true);
    expect(normalizeCellComponents(row.cells[0]).map((c) => c.type)).toEqual(["texto_corto"]);
    expect((normalizeCellComponents(row.cells[0])[0] as any).maxLength).toBe(1000);
  });
});

describe("contenido de una opción: enlaces, campo con rótulo y tablas con título", () => {
  const r = parsePastedText("¿Declara contribuciones?\n○ Sí, la empresa informa.\n    Se permiten un máximo de 3 URL\n    Divisa: _____\n    § Problemas y temas\n    | Tema | Importe |\n    | x | #_____ |\n\n    § Otros gastos importantes\n    | Nombre | Importe |\n    | y | #_____ |\n○ No\n");
  const o = (r[0]!.element as any).options[0];
  it("el rótulo no ensucia la opción y cada pieza va a su sitio", () => {
    expect(o.label).toBe("Sí, la empresa informa.");
    expect(o.references).toEqual({ maxUrls: 3 });
    expect(o.field).toMatchObject({ type: "texto_corto", label: "Divisa:" });
  });
  it("cada tabla conserva su título", () => {
    expect(o.table.title).toBe("Problemas y temas");
    expect(o.moreTables[0].title).toBe("Otros gastos importantes");
    expect(formElement.safeParse(r[0]!.element).success).toBe(true);
  });
});
