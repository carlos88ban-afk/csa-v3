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

describe("celdas con casilla/opción separada de su rótulo", () => {
  it("une '☐ ¦ Operaciones' en una sola casilla con rótulo y no deja opciones vacías", () => {
    const text = [
      "¿Impactos?",
      "    | Aspecto | Impacto 1 |",
      "    | Causa | Cadena: ¦ ☐ ¦ Operaciones ¦ ☐ ¦ Productos ¦ ○ ¦ Alta ¦ ○ ¦ Baja |",
      "",
    ].join("\n");
    const json = JSON.stringify(parsePastedText(text));
    expect(json).toContain("Operaciones");
    expect(json).toContain("Productos");
    expect(json).toContain("Alta");
    expect(json).not.toContain('"options":[]');
  });
});

describe("VS-079: notas por opción y bloques ilimitados", () => {
  const first = (text: string) => parsePastedText(text)[0]!.element as unknown as { options: Record<string, unknown>[] };

  it("guarda el texto explicativo bajo una opción como nota", () => {
    const el = first(
      [
        "¿Tiene declaración de independencia?",
        "",
        "○ Sí, la empresa cuenta con una declaración.",
        "    Las empresas que cotizan en bolsa están obligadas a proporcionar enlaces.",
        "    Las empresas que no cotizan deben proporcionar documentos internos.",
        "○ No",
        "",
      ].join("\n"),
    );
    expect(String(el.options[0]!.note)).toContain("cotizan en bolsa");
    expect(String(el.options[0]!.note)).toContain("documentos internos");
  });

  it("conserva 4 grupos §§ bajo una opción (2.º en secondaryOptions, 3.º y 4.º en moreBlocks)", () => {
    const el = first(
      [
        "¿Integra TCFD?",
        "",
        "○ Sí, integra TCFD",
        "    §§ Gobernanza",
        "    ☐ a) Supervisión del consejo",
        "    §§ Estrategia",
        "    ☐ a) Riesgos y oportunidades",
        "    §§ Gestión de riesgos",
        "    ☐ a) Procesos de identificación",
        "    §§ Métricas",
        "    ☐ a) Métricas usadas",
        "○ No",
        "",
      ].join("\n"),
    );
    const o = el.options[0]! as { subOptionsHeading?: string; secondaryOptionsHeading?: string; moreBlocks?: { heading: string; options: { label: string }[] }[] };
    expect(o.subOptionsHeading).toContain("Gobernanza");
    expect(o.secondaryOptionsHeading).toContain("Estrategia");
    expect(o.moreBlocks?.map((b) => b.heading)).toEqual(["Gestión de riesgos", "Métricas"]);
    expect(o.moreBlocks?.[1]!.options[0]!.label).toContain("Métricas usadas");
  });
});

describe("Secciones MSA: la guía no absorbe el texto de la pregunta", () => {
  it("guía → banner; título y texto de la sección → texto informativo (no todo en un banner)", () => {
    const r = parsePastedText(
      ["Información adicional y guía para preguntas", "", "Con base en un Análisis (AMPI), se revisa la coherencia.", "", "# Gobierno corporativo de MSA", "", "En esta sección se incluye una puntuación de desempeño. No se requiere información adicional de su empresa.", ""].join("\n"),
    );
    expect(r.map((x) => x.element.type)).toEqual(["banner", "instruccion", "instruccion"]);
  });
});
