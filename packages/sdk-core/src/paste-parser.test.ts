import { describe, expect, it } from "vitest";
import { formElement } from "./form-schema.js";
import { parsePastedText } from "./paste-parser.js";

const types = (t: string) => parsePastedText(t).map((p) => p.element.type);

describe("parsePastedText", () => {
  it("radio → selección única", () => {
    const r = parsePastedText("¿Tiene política de eficiencia energética?\n\n○ Sí\n○ No");
    expect(r).toHaveLength(1);
    expect(r[0]!.element.type).toBe("seleccion_unica");
    expect((r[0]!.element as any).options).toHaveLength(2);
  });
  it("casillas → selección múltiple", () => {
    expect(types("Materiales reciclados\n☐ Papel\n☐ Vidrio\n☑ Plástico")).toEqual(["seleccion_multiple"]);
  });
  it("línea en blanco con unidad → número con unidad", () => {
    const r = parsePastedText("Consumo de energía\n\n_____ kWh");
    expect(r[0]!.element.type).toBe("numero");
    expect((r[0]!.element as any).unit).toBe("kWh");
  });
  it("tabla markdown → tabla_datos", () => {
    const r = parsePastedText("| Material | Objetivo | Evidencia |\n|---|---|---|\n| Papel | 10% | |");
    expect(r[0]!.element.type).toBe("tabla_datos");
  });
  it("tabla pegada desde Excel (tabs)", () => {
    expect(types("Material\tObjetivo\tEvidencia\nPapel\t10\tsi")).toEqual(["tabla_datos"]);
  });
  it("lista con viñetas → selección", () => {
    expect(types("Seleccione el tipo de energía\n- Solar\n- Eólica\n- Hidráulica")).toEqual(["seleccion_unica"]);
    expect(types("Seleccione todas las que apliquen\n- Solar\n- Eólica")).toEqual(["seleccion_multiple"]);
  });
  it("sub-opciones por sangría", () => {
    const r = parsePastedText("¿Tiene política?\n○ Sí\n    ○ Pública\n    ○ Interna\n○ No");
    const opts = (r[0]!.element as any).options;
    expect(opts).toHaveLength(2);
    expect(opts[0].subOptions).toHaveLength(2);
  });
  it("Sí/No inline, evidencia, URL, fecha, aviso", () => {
    expect(types("¿Cuenta con certificación? (Sí/No)")).toEqual(["seleccion_unica"]);
    expect(types("Adjunte la evidencia correspondiente")).toEqual(["evidencia"]);
    expect(types("Indique el enlace al informe publicado")).toEqual(["url_publica"]);
    expect(types("Fecha de la última auditoría")).toEqual(["fecha"]);
    expect(types("Aviso: el reconocimiento solo es posible con pruebas públicas")).toEqual(["banner"]);
  });
  it("cuestionario completo con numeración", () => {
    const r = parsePastedText("1. ¿Tiene política?\n○ Sí\n○ No\n\n2. Consumo de agua ____ m3\n\n3. Describa el proceso de gestión");
    expect(r.map((p) => p.element.type)).toEqual(["seleccion_unica", "numero", "texto_largo"]);
    expect((r[0]!.element as any).label).toBe("¿Tiene política?");
  });
  it("todo lo generado valida contra el schema", () => {
    const r = parsePastedText("Aviso: x\n\n¿A?\n○ Sí\n    ○ b\n○ No\n\nTabla\n| a | b |\n| c | d |\n\nConsumo ___ kWh\nFecha de cierre\nAdjunte evidencia");
    for (const p of r) expect(formElement.safeParse(p.element).success).toBe(true);
  });
});
