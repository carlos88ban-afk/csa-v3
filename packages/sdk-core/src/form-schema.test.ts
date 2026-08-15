import { describe, expect, it } from "vitest";
import { formElement, formSchema } from "./form-schema.js";

describe("formElement", () => {
  it.each([
    { type: "texto_corto", id: "1", label: "Nombre" },
    { type: "texto_largo", id: "2", label: "Comentarios", maxLength: 500 },
    { type: "numero", id: "3", label: "Edad", min: 0, max: 120 },
    { type: "numero", id: "3b", label: "Emisiones", unit: "met. ton. CO2e" },
    { type: "numero", id: "3c", label: "Consumo", availableUnits: ["MWh", "GJ", "kWh"] },
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
    { type: "banner", id: "7", label: "Aviso importante", content: "Detalle del aviso", variant: "warning" },
    { type: "banner", id: "7b", label: "Aviso largo", content: "Detalle largo del aviso", variant: "info", startCollapsed: true },
    { type: "evidencia", id: "8", label: "Adjunte su certificado", maxFiles: 3, maxSizeMb: 10, acceptedTypes: ["pdf", "png"] },
    { type: "calculado", id: "9", label: "Total", expression: "{el-1} + {el-2}", decimals: 2 },
    { type: "calculado", id: "10", label: "Total sin decimals", expression: "1 + 1" },
    { type: "url_publica", id: "url-1", label: "Referencias públicas", maxUrls: 3 },
    { type: "url_publica", id: "url-2", label: "Sin límite explícito" },
    {
      type: "seleccion_desplegable",
      id: "dpd-1",
      label: "Moneda",
      options: [{ id: "usd", label: "USD" }, { id: "pen", label: "PEN" }],
    },
    {
      type: "tabla_datos",
      id: "tbl-1",
      label: "Emisiones GHG Scope 1",
      columns: [{ id: "fy2023", label: "FY 2023" }, { id: "fy2024", label: "FY 2024" }],
      rows: [
        { id: "total", label: "Total Scope 1", cellType: "numero", unit: "met. ton. CO2e" },
        { id: "coverage", label: "Coverage %", cellType: "numero", availableUnits: ["%"] },
        { id: "moneda", label: "Moneda", cellType: "seleccion_desplegable", options: [{ id: "usd", label: "USD" }] },
        { id: "nota", label: "Nota", cellType: "texto", maxLength: 200 },
      ],
    },
    {
      type: "seleccion_unica",
      id: "11",
      label: "¿Aplica?",
      options: [{ id: "si", label: "Sí", subOptions: [{ id: "sub-a", label: "Sub A" }] }],
    },
    {
      type: "seleccion_unica",
      id: "11b",
      label: "¿Aplica? (2 niveles)",
      options: [
        {
          id: "si",
          label: "Sí",
          subOptions: [
            { id: "sub-a", label: "Sub A", subOptions: [{ id: "subsub-a1", label: "Sub-sub A1" }] },
            { id: "sub-b", label: "Sub B" },
          ],
        },
      ],
    },
    {
      type: "seleccion_multiple",
      id: "12",
      label: "Seleccione todos los que apliquen",
      options: [
        { id: "opt-1", label: "Opción 1" },
        { id: "opt-2", label: "Opción 2", subOptions: [{ id: "sub-b", label: "Sub B" }, { id: "sub-c", label: "Sub C" }] },
      ],
    },
    // Referencias de URL por opción (VS-039, docs/engines/form.md).
    {
      type: "seleccion_unica",
      id: "13",
      label: "¿La empresa informa sobre el alcance de su divulgación?",
      options: [
        { id: "si", label: "Sí", references: { maxUrls: 3 } },
        { id: "no", label: "No" },
      ],
    },
    {
      type: "seleccion_multiple",
      id: "14",
      label: "Indicadores divulgados",
      options: [{ id: "ind-1", label: "Indicador 1", references: {} }],
    },
    // Campos embebidos en sub-opciones + exclusividad (VS-040, docs/engines/form.md).
    {
      type: "seleccion_unica",
      id: "15",
      label: "¿Aplica?",
      options: [
        {
          id: "si",
          label: "Sí",
          subOptionsExclusive: true,
          subOptions: [
            { id: "a", label: "Todas las actividades" },
            {
              id: "b",
              label: "% de ingresos",
              field: {
                type: "seleccion_desplegable",
                options: [{ id: "0-25", label: "0-25%" }, { id: "25-50", label: "25-50%" }],
              },
            },
            { id: "c", label: "Control operativo", field: { type: "texto_corto", maxLength: 200 } },
            { id: "d", label: "Otro", field: { type: "numero", min: 0, max: 100, unit: "%" }, references: { maxUrls: 2 } },
          ],
        },
      ],
    },
  // Tabla embebida en una sub-opción (VS-042, docs/engines/form.md).
    {
      type: "seleccion_unica",
      id: "16",
      label: "Alcance de la información",
      options: [
        {
          id: "opciones",
          label: "Opciones",
          subOptions: [
            {
              id: "cobertura",
              label: "Cobertura",
              table: {
                columns: [{ id: "fy2024", label: "FY 2024" }],
                rows: [{ id: "pct", label: "%", cellType: "numero", unit: "%" }],
              },
            },
            { id: "sin-tabla", label: "Sin tabla" },
          ],
        },
      ],
    },
  ])("acepta un elemento válido de tipo $type", (element) => {
    expect(formElement.safeParse(element).success).toBe(true);
  });

  it("acepta visibleIf en cualquier tipo de elemento", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "banner",
      label: "Solo si aplica",
      content: "Detalle",
      variant: "info",
      visibleIf: { elementId: "otro", operator: "equals", value: "si" },
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un type desconocido", () => {
    const result = formElement.safeParse({ id: "1", type: "tabla", label: "x" });
    expect(result.success).toBe(false);
  });

  it("rechaza seleccion_unica sin options", () => {
    const result = formElement.safeParse({ id: "1", type: "seleccion_unica", label: "x", options: [] });
    expect(result.success).toBe(false);
  });

  it("rechaza seleccion_desplegable sin options", () => {
    const result = formElement.safeParse({ id: "1", type: "seleccion_desplegable", label: "x", options: [] });
    expect(result.success).toBe(false);
  });

  it("rechaza numero con availableUnits vacío", () => {
    const result = formElement.safeParse({ id: "1", type: "numero", label: "x", availableUnits: [] });
    expect(result.success).toBe(false);
  });

  it("rechaza tabla_datos sin columns", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "tabla_datos",
      label: "x",
      columns: [],
      rows: [{ id: "r1", label: "Fila", cellType: "texto" }],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza tabla_datos sin rows", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "tabla_datos",
      label: "x",
      columns: [{ id: "c1", label: "Col" }],
      rows: [],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza una fila de tabla_datos con cellType desconocido", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "tabla_datos",
      label: "x",
      columns: [{ id: "c1", label: "Col" }],
      rows: [{ id: "r1", label: "Fila", cellType: "fecha" }],
    });
    expect(result.success).toBe(false);
  });

  it("acepta una fila de tabla_datos con cells (overrides por celda) sin cellType", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "tabla_datos",
      label: "x",
      columns: [
        { id: "c1", label: "Tipo" },
        { id: "c2", label: "Número" },
      ],
      rows: [
        {
          id: "r1",
          label: "Fila mixta",
          cells: [
            { columnId: "c1", cellType: "texto", maxLength: 100 },
            { columnId: "c2", cellType: "numero", unit: "miembros" },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("acepta una fila de tabla_datos con cellType legacy y cells de override juntos", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "tabla_datos",
      label: "x",
      columns: [{ id: "c1", label: "Col" }],
      rows: [{ id: "r1", label: "Fila", cellType: "texto", cells: [{ columnId: "c1", cellType: "numero" }] }],
    });
    expect(result.success).toBe(true);
  });

  it("rechaza una fila de tabla_datos sin cellType ni cells", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "tabla_datos",
      label: "x",
      columns: [{ id: "c1", label: "Col" }],
      rows: [{ id: "r1", label: "Fila", maxLength: 10 }],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza una fila de tabla_datos con cells vacío y sin cellType", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "tabla_datos",
      label: "x",
      columns: [{ id: "c1", label: "Col" }],
      rows: [{ id: "r1", label: "Fila", cells: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza una fila de tabla_datos con cell de cellType desconocido", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "tabla_datos",
      label: "x",
      columns: [{ id: "c1", label: "Col" }],
      rows: [{ id: "r1", label: "Fila", cells: [{ columnId: "c1", cellType: "fecha" }] }],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza una fila de tabla_datos con cell sin columnId", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "tabla_datos",
      label: "x",
      columns: [{ id: "c1", label: "Col" }],
      rows: [{ id: "r1", label: "Fila", cells: [{ cellType: "texto" }] }],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza banner sin variant", () => {
    const result = formElement.safeParse({ id: "1", type: "banner", label: "x", content: "y" });
    expect(result.success).toBe(false);
  });

  it("rechaza banner sin content", () => {
    const result = formElement.safeParse({ id: "1", type: "banner", label: "x", variant: "info" });
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

  it("rechaza una opción con subOptions que tiene id vacío", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "opt-a", label: "Opción A", subOptions: [{ id: "", label: "Sub vacía" }] }],
    });
    expect(result.success).toBe(false);
  });

  // Referencias de URL por opción (VS-039, docs/engines/form.md).
  it("acepta una opción sin references (campo opcional, compatible hacia atrás)", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "a", label: "A" }],
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "seleccion_unica") {
      expect(result.data.options[0]?.references).toBeUndefined();
    }
  });

  it("acepta references sin maxUrls explícito (el default de 3 lo aplica el Runtime, no zod)", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "a", label: "A", references: {} }],
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "seleccion_unica") {
      expect(result.data.options[0]?.references?.maxUrls).toBeUndefined();
    }
  });

  it("acepta references con maxUrls explícito", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "a", label: "A", references: { maxUrls: 5 } }],
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "seleccion_unica") {
      expect(result.data.options[0]?.references?.maxUrls).toBe(5);
    }
  });

  it("rechaza references con maxUrls no positivo", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "a", label: "A", references: { maxUrls: 0 } }],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza references con maxUrls no entero", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_multiple",
      label: "Pregunta",
      options: [{ id: "a", label: "A", references: { maxUrls: 1.5 } }],
    });
    expect(result.success).toBe(false);
  });

  // Campos embebidos en sub-opciones + exclusividad (VS-040, docs/engines/form.md).
  it("acepta una sub-opción sin field/references/subOptionsExclusive (compatible hacia atrás)", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "a", label: "A", subOptions: [{ id: "sub-a", label: "Sub A" }] }],
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "seleccion_unica") {
      expect(result.data.options[0]?.subOptionsExclusive).toBeUndefined();
      expect(result.data.options[0]?.subOptions?.[0]?.field).toBeUndefined();
    }
  });

  it("acepta subOptionsExclusive true/false explícito", () => {
    const trueResult = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "a", label: "A", subOptionsExclusive: true, subOptions: [{ id: "sub-a", label: "Sub A" }] }],
    });
    const falseResult = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "a", label: "A", subOptionsExclusive: false, subOptions: [{ id: "sub-a", label: "Sub A" }] }],
    });
    expect(trueResult.success).toBe(true);
    expect(falseResult.success).toBe(true);
  });

  it("acepta field tipo seleccion_desplegable en una sub-opción", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [
        {
          id: "a",
          label: "A",
          subOptions: [{ id: "sub-a", label: "Sub A", field: { type: "seleccion_desplegable", options: [{ id: "x", label: "X" }] } }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rechaza field seleccion_desplegable con options vacío", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [
        { id: "a", label: "A", subOptions: [{ id: "sub-a", label: "Sub A", field: { type: "seleccion_desplegable", options: [] } }] },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("acepta field tipo texto_corto sin maxLength (opcional)", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "a", label: "A", subOptions: [{ id: "sub-a", label: "Sub A", field: { type: "texto_corto" } }] }],
    });
    expect(result.success).toBe(true);
  });

  it("acepta field tipo numero con min/max/unit", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "a", label: "A", subOptions: [{ id: "sub-a", label: "Sub A", field: { type: "numero", min: 0, max: 100, unit: "%" } }] }],
    });
    expect(result.success).toBe(true);
  });

  it("rechaza field con type desconocido", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "a", label: "A", subOptions: [{ id: "sub-a", label: "Sub A", field: { type: "fecha" } }] }],
    });
    expect(result.success).toBe(false);
  });

  it("acepta references en una sub-opción (mismo campo que formOption.references)", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "a", label: "A", subOptions: [{ id: "sub-a", label: "Sub A", references: { maxUrls: 2 } }] }],
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "seleccion_unica") {
      expect(result.data.options[0]?.subOptions?.[0]?.references?.maxUrls).toBe(2);
    }
  });

  // Posición configurable de las referencias (VS-041, docs/engines/form.md
  // "Corrección posterior: posición configurable").
  it("acepta references sin position (default before_suboptions implícito)", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "a", label: "A", references: {} }],
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "seleccion_unica") {
      expect(result.data.options[0]?.references?.position).toBeUndefined();
    }
  });

  it("acepta references con position before_suboptions/after_suboptions explícito", () => {
    const before = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "a", label: "A", references: { position: "before_suboptions" } }],
    });
    const after = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "a", label: "A", references: { position: "after_suboptions" } }],
    });
    expect(before.success).toBe(true);
    expect(after.success).toBe(true);
  });

  it("rechaza references con position desconocida", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "a", label: "A", references: { position: "middle" } }],
    });
    expect(result.success).toBe(false);
  });

  // Referencias flexibles (VS-045, docs/engines/form.md "Formato en preguntas
  // y opciones + referencias flexibles").
  it("acepta references sin refType (default public implícito, compatible con VS-039)", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "a", label: "A", references: {} }],
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "seleccion_unica") {
      expect(result.data.options[0]?.references?.refType).toBeUndefined();
    }
  });

  it("acepta references con refType public/flexible explícito", () => {
    const pub = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "a", label: "A", references: { refType: "public" } }],
    });
    const flex = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "a", label: "A", references: { refType: "flexible" } }],
    });
    expect(pub.success).toBe(true);
    expect(flex.success).toBe(true);
  });

  it("rechaza references con refType desconocido", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "a", label: "A", references: { refType: "internal" } }],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza una sub-opción de 2do nivel con id vacío (VS-026)", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [
        {
          id: "opt-a",
          label: "Opción A",
          subOptions: [{ id: "sub-a", label: "Sub A", subOptions: [{ id: "", label: "Sub-sub vacía" }] }],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  // Tabla embebida en una sub-opción (VS-042, docs/engines/form.md).
  it("acepta una sub-opción sin table (compatible hacia atrás)", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [{ id: "a", label: "A", subOptions: [{ id: "sub-a", label: "Sub A" }] }],
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "seleccion_unica") {
      expect(result.data.options[0]?.subOptions?.[0]?.table).toBeUndefined();
    }
  });

  it("acepta una sub-opción con tabla embebida completa (columns + rows)", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [
        {
          id: "a",
          label: "A",
          subOptions: [
            {
              id: "sub-a",
              label: "Sub A",
              table: {
                columns: [{ id: "c1", label: "FY 2024" }, { id: "c2", label: "FY 2025" }],
                rows: [
                  { id: "r1", label: "Total", cellType: "numero", unit: "met. ton. CO2e" },
                  { id: "r2", label: "Nota", cellType: "texto", maxLength: 100 },
                  { id: "r3", label: "Moneda", cellType: "seleccion_desplegable", options: [{ id: "usd", label: "USD" }] },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("acepta una sub-opción con field y table a la vez", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [
        {
          id: "a",
          label: "A",
          subOptions: [
            {
              id: "sub-a",
              label: "Sub A",
              field: { type: "numero", unit: "%" },
              table: {
                columns: [{ id: "c1", label: "FY 2024" }],
                rows: [{ id: "r1", label: "Total", cellType: "numero" }],
              },
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rechaza una sub-opción con tabla embebida sin columns", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [
        {
          id: "a",
          label: "A",
          subOptions: [{ id: "sub-a", label: "Sub A", table: { columns: [], rows: [{ id: "r1", label: "Fila", cellType: "texto" }] } }],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza una sub-opción con tabla embebida sin rows", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [
        {
          id: "a",
          label: "A",
          subOptions: [{ id: "sub-a", label: "Sub A", table: { columns: [{ id: "c1", label: "Col" }], rows: [] } }],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza una fila de tabla embebida con cellType desconocido", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [
        {
          id: "a",
          label: "A",
          subOptions: [
            { id: "sub-a", label: "Sub A", table: { columns: [{ id: "c1", label: "Col" }], rows: [{ id: "r1", label: "Fila", cellType: "fecha" }] } },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  // VS-042: una opción de fila de tabla (seleccion_desplegable) puede llevar
  // subOptions en schemas antiguos sin romper la validación (zod hace strip).
  it("acepta subOptions en una opción de fila de tabla (strip, compatible)", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "tabla_datos",
      label: "Tabla",
      columns: [{ id: "c1", label: "Col" }],
      rows: [
        {
          id: "r1",
          label: "Fila",
          cellType: "seleccion_desplegable",
          options: [{ id: "o1", label: "O1", subOptions: [{ id: "s1", label: "S1" }] }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  // VS-044: la tabla embebida comparte el mismo formTableRow — los overrides
  // por celda funcionan igual que en tabla_datos.
  it("acepta una fila de tabla embebida con cells mixtos (VS-044)", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [
        {
          id: "a",
          label: "A",
          subOptions: [
            {
              id: "sub-a",
              label: "Sub A",
              table: {
                columns: [
                  { id: "c1", label: "Tipo" },
                  { id: "c2", label: "Número" },
                ],
                rows: [
                  {
                    id: "r1",
                    label: "Fila",
                    cells: [
                      { columnId: "c1", cellType: "texto" },
                      { columnId: "c2", cellType: "numero" },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rechaza una fila de tabla embebida sin cellType ni cells (VS-044)", () => {
    const result = formElement.safeParse({
      id: "1",
      type: "seleccion_unica",
      label: "Pregunta",
      options: [
        {
          id: "a",
          label: "A",
          subOptions: [
            {
              id: "sub-a",
              label: "Sub A",
              table: { columns: [{ id: "c1", label: "Col" }], rows: [{ id: "r1", label: "Fila" }] },
            },
          ],
        },
      ],
    });
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

  it("acepta un calculado que referencia un numero y otro calculado sin ciclo", () => {
    const result = formSchema.safeParse({
      schemaVersion: 1,
      elements: [
        { id: "n1", type: "numero", label: "A" },
        { id: "c1", type: "calculado", label: "Doble de A", expression: "{n1} * 2" },
        { id: "c2", type: "calculado", label: "Doble de c1", expression: "{c1} * 2" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rechaza una fórmula que se autorreferencia (ciclo de longitud 1)", () => {
    const result = formSchema.safeParse({
      schemaVersion: 1,
      elements: [{ id: "c1", type: "calculado", label: "X", expression: "{c1} + 1" }],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un ciclo de fórmulas de longitud 2", () => {
    const result = formSchema.safeParse({
      schemaVersion: 1,
      elements: [
        { id: "c1", type: "calculado", label: "A", expression: "{c2} + 1" },
        { id: "c2", type: "calculado", label: "B", expression: "{c1} + 1" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un ciclo de fórmulas de longitud 3", () => {
    const result = formSchema.safeParse({
      schemaVersion: 1,
      elements: [
        { id: "c1", type: "calculado", label: "A", expression: "{c2}" },
        { id: "c2", type: "calculado", label: "B", expression: "{c3}" },
        { id: "c3", type: "calculado", label: "C", expression: "{c1}" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza visibleIf que referencia al propio elemento", () => {
    const result = formSchema.safeParse({
      schemaVersion: 1,
      elements: [
        { id: "1", type: "texto_corto", label: "X", visibleIf: { elementId: "1", operator: "isAnswered" } },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("acepta visibleIf que referencia otro elemento", () => {
    const result = formSchema.safeParse({
      schemaVersion: 1,
      elements: [
        { id: "1", type: "seleccion_unica", label: "¿Aplica?", options: [{ id: "si", label: "Sí" }] },
        { id: "2", type: "texto_corto", label: "Detalle", visibleIf: { elementId: "1", operator: "equals", value: "si" } },
      ],
    });
    expect(result.success).toBe(true);
  });
});
