import { describe, expect, it } from "vitest";
import { formElement } from "./form-schema.js";
import { parsePastedText } from "./paste-parser.js";

// Tabla de serie histórica como la entrega el portal CSA (campos Float/Percent/Integer, columnas por año).
const TXT = `¿Informa la empresa su tasa impositiva efectiva?
○ Sí, la empresa informa la tasa impositiva efectiva de los últimos años.
    | Informes financieros | Año fiscal 2023 | Año fiscal 2024 | Año fiscal 2025 | Tasa calculada |
    | Ganancias antes de impuestos | #_____ | #_____ | #_____ | |
    | Cobertura de proveedores | %_____ | %_____ | %_____ | |
    | Pública | ○ Sí ○ No | ○ Sí ○ No | ○ Sí ○ No | ☐ Sí |
○ No, la empresa no informa.
`;

describe("tablas con datos numéricos y años", () => {
  const r = parsePastedText(TXT);
  const q = r[0]!.element as any;
  const cells = (row: number) => q.options[0].table.rows[row].cells;
  it("números → numero, porcentajes → numero con %, Sí/No → desplegable, casilla suelta → casilla", () => {
    expect(cells(1)[1].cellType).toBe("numero");
    expect(cells(2)[1]).toMatchObject({ cellType: "numero", unit: "%" });
    expect(cells(3)[1]).toMatchObject({ cellType: "seleccion_desplegable" });
    expect(cells(3)[1].options.map((o: any) => o.label)).toEqual(["Sí", "No"]);
    expect(cells(3)[4].cellType).toBe("casilla");
  });
  it("las filas se nombran con la primera columna y el encabezado es solo lectura", () => {
    expect(cells(1)[0]).toMatchObject({ editable: false });
    expect(cells(0)[2]).toMatchObject({ editable: false });
  });
  it("avisa que las columnas de años anteriores son candidatas a dato histórico", () => {
    expect(r[0]!.reason).toMatch(/Año fiscal 2023, Año fiscal 2024/);
    expect(r[0]!.reason).not.toMatch(/2025\)/);
  });
  it("valida contra el schema", () => {
    for (const p of r) expect(formElement.safeParse(p.element).success).toBe(true);
  });
});

describe("párrafos explicativos entre la pregunta y las opciones", () => {
  const r = parsePastedText(`¿La empresa informa sobre la tasa impositiva de los dos últimos ejercicios?

Las empresas que cotizan en bolsa están obligadas a proporcionar enlaces.

Las empresas que no cotizan deben proporcionar documentos internos.

○ Sí, la empresa informa la tasa impositiva.
    | Informes financieros | Año fiscal 2024 | Año fiscal 2025 |
    | Ganancias antes de impuestos | #_____ numérico | #_____ numérico |
○ No, la empresa no informa.
`);
  it("una sola pregunta; los párrafos pasan a ser su descripción", () => {
    expect(r.map((p) => p.element.type)).toEqual(["seleccion_unica"]);
    const q = r[0]!.element as any;
    expect(q.helpText).toContain("cotizan en bolsa");
    expect(q.helpText).toContain("documentos internos");
    expect(q.options).toHaveLength(2);
  });
  it("el texto auxiliar 'numérico' no ensucia la celda", () => {
    const cell = (r[0]!.element as any).options[0].table.rows[1].cells[1];
    expect(cell.cellType).toBe("numero");
    expect(cell.content).toBeUndefined();
  });
});
