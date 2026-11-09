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

describe("parsePastedText — correcciones QA (hallazgos 1-3)", () => {
  it("#1 'Describa… emisiones (máx. 500 palabras)' → texto largo, no número", () => {
    const r = parsePastedText("Describa las acciones de reducción de emisiones (máx. 500 palabras)");
    expect(r[0]!.element.type).toBe("texto_largo");
  });
  it("#1 una pregunta de cifra sigue siendo número", () => {
    expect(types("¿Cuántas toneladas de residuos generó?")).toEqual(["numero"]);
  });
  it("#2 fila de Excel con celdas vacías se queda dentro de la tabla", () => {
    const r = parsePastedText("Año\tAlcance 1\tAlcance 2\tUnidad\n2023\t1250\t980\tt\n2024\t1100\t850\tt\n2025\t\t\t");
    expect(r).toHaveLength(1);
    expect(r[0]!.element.type).toBe("tabla_datos");
    expect((r[0]!.element as any).rows).toHaveLength(4); // encabezado + 3 filas
  });
  it("#3 ☐ Sí/No/Parcialmente → selección única", () => {
    const r = parsePastedText("1. ¿La empresa tiene política de eficiencia energética?\n☐ Sí\n☐ No\n☐ Parcialmente");
    expect(r[0]!.element.type).toBe("seleccion_unica");
  });
  it("#3 ☐ con 'seleccione todas' sigue siendo múltiple", () => {
    expect(types("Seleccione todas las certificaciones que posee:\n☐ ISO 14001\n☐ LEED")).toEqual(["seleccion_multiple"]);
  });
  it("#3 ☐ con opciones temáticas sigue siendo múltiple", () => {
    expect(types("Materiales\n☐ Papel\n☐ Vidrio")).toEqual(["seleccion_multiple"]);
  });
});

describe("parsePastedText — sub-opciones con tabla propia (S&P 1.2.2 Tipo de placa)", () => {
  const txt = [
    "¿La empresa informa sobre el tipo de consejo?",
    "",
    "○ Sí, la empresa informa.",
    "    Se permiten un máximo de 3, solo URL públicas",
    "    ○ SISTEMA DE UN SOLO NIVEL",
    "        | Tipo de director | Número de miembros |",
    "        | directores ejecutivos | #_____ ¦ numérico |",
    "    ○ SISTEMA DE DOS NIVELES",
    "        | Tipo de tablero | Tipo de director | Número |",
    "        | Consejo de supervisión | directores independientes | #_____ ¦ numérico |",
    "○ No, la empresa no informa.",
  ].join("\n");
  it("cada sub-opción conserva su tabla y es excluyente (radio)", () => {
    const el = parsePastedText(txt)[0]!.element as any;
    const o1 = el.options[0];
    expect(o1.subOptions).toHaveLength(2);
    expect(o1.subOptionsExclusive).toBe(true);
    expect(o1.subOptions[0].table.rows).toHaveLength(2);
    expect(o1.subOptions[1].table.columns).toHaveLength(3);
    expect(o1.table).toBeUndefined();
  });
  it("'solo URL públicas' → refType public", () => {
    const el = parsePastedText(txt)[0]!.element as any;
    expect(el.options[0].references).toEqual({ maxUrls: 3, refType: "public" });
  });
});

describe("parsePastedText — orientación vacía", () => {
  it("un bloque 'Información adicional' sin texto avisa con baja confianza", () => {
    const r = parsePastedText("Información adicional y guía para preguntas\n\n# Tipo de placa\n¿La empresa informa el tipo?\n\n○ Sí\n○ No");
    const g = r.find((x) => x.element.type === "banner")!;
    expect(g.confidence).toBe("baja");
  });
});
