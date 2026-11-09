import { describe, expect, it } from "vitest";
import { formElement } from "./form-schema.js";
import { parsePastedText } from "./paste-parser.js";

// Pregunta real de S&P CSA (1.3.4) pegada como texto plano: sin viñetas, con el bloque
// de orientación, referencias, una tabla interna y las 4 opciones habituales.
const PLAIN = `Cuestiones materiales para los actores externos:

Aviso: El reconocimiento completo solo es posible con pruebas relevantes disponibles públicamente
Si tienes información de apoyo en una fuente pública, por favor inclúyela como referencia a esta pregunta.

Si no tienes pruebas públicas, pero tienes referencias no públicas adicionales, el texto indicará si está permitido.

Información adicional y orientación para preguntas
Justificación de la pregunta
Esta pregunta reconoce a las empresas que identifican y valoran el impacto externalizado.

Requisitos de datos
Por favor, indique dos cuestiones materiales.

Las formas aceptables de reporte incluyen:

Análisis/métricas de materialidad con la integración de aspectos de impacto externo.
Sección de valoración de impacto de un informe.
Referencias
Protocolo de Capital Natural

https://capitalscoalition.org/capitals-approach/natural-capital-protocol/

TNFD - Estrategia A

Cuestiones materiales para los actores externos
¿Realiza la empresa un análisis de materialidad para identificar y valorar el impacto en los interesados externos?



Sí, la empresa ha evaluado impactos positivos y/o negativos en los interesados externos.

Aspectos

Impacto 1

Impacto 2

Pruebas que lo respaldan

Reportaje público

Sí

No, la empresa no evalúa los impactos positivos y/o negativos.


La pregunta no es aplicable a la empresa.


La información no está disponible.
`;

describe("pregunta CSA real pegada como texto plano", () => {
  const r = parsePastedText(PLAIN);
  it("estructura: aviso, orientación contraíble y UNA pregunta de selección única", () => {
    expect(r.map((p) => p.element.type)).toEqual(["banner", "banner", "seleccion_unica"]);
  });
  it("el aviso lleva título y contenido", () => {
    const b = r[0]!.element as any;
    expect(b.label).toContain("Aviso: El reconocimiento completo");
    expect(b.content).toContain("fuente pública");
    expect(b.content).toContain("referencias no públicas");
  });
  it("la orientación queda colapsada y conserva secciones y URLs", () => {
    const b = r[1]!.element as any;
    expect(b.startCollapsed).toBe(true);
    expect(b.content).toContain("<strong>Justificación de la pregunta</strong>");
    expect(b.content).toContain("capitalscoalition.org");
    expect(b.content).not.toContain("¿Realiza");
  });
  it("las 4 opciones y el título de la pregunta", () => {
    const q = r[2]!.element as any;
    expect(q.label).toMatch(/^¿Realiza la empresa/);
    expect(q.options).toHaveLength(4);
    expect(q.options[0].label).toMatch(/^Sí, la empresa/);
    expect(q.options[3].label).toMatch(/no está disponible/);
  });
  it("avisa que el contenido interno quedó sin estructura", () => {
    expect(r[2]!.confidence).toBe("media");
    expect(r[2]!.reason).toMatch(/sin estructura/);
  });
  it("todo valida contra el schema", () => {
    for (const p of r) expect(formElement.safeParse(p.element).success).toBe(true);
  });
});

describe("texto estructurado (viene del HTML de la página)", () => {
  const MARKED = `Aviso: Requisito de evidencia pública

# Información adicional y orientación para preguntas
# Justificación
Texto.
# Cuestiones materiales para los actores externos
¿Realiza la empresa un análisis de materialidad?
○ Sí, la empresa lo evaluó.
    | Aspectos | Impacto 1 | Impacto 2 |
    | Pruebas que lo respaldan | ____ | ____ |
    | Reportaje público | ☐ Sí | ☐ Sí |

○ No, la empresa no evalúa.
○ La pregunta no es aplicable.
`;
  const r = parsePastedText(MARKED);
  it("pregunta con tabla dentro de la primera opción", () => {
    expect(r.map((p) => p.element.type)).toEqual(["banner", "banner", "seleccion_unica"]);
    const q = r[2]!.element as any;
    expect(q.options).toHaveLength(3);
    expect(q.options[0].table.rows).toHaveLength(3);
    expect(q.options[0].table.columns).toHaveLength(3);
    expect(r[2]!.confidence).toBe("alta");
  });
  it("valida contra el schema", () => {
    for (const p of r) expect(formElement.safeParse(p.element).success).toBe(true);
  });
});

describe("variantes del título del bloque de orientación", () => {
  it("'Información adicional y guía para preguntas' también se colapsa en un solo aviso", () => {
    const r = parsePastedText(`Aviso: Algo

Información adicional y guía para preguntas
# Justificación
Texto largo de la justificación de la pregunta que sigue.
# Métricas de materialidad
¿Ha evaluado la empresa los impactos?
○ Sí, la empresa ha evaluado.
○ No, la empresa no evalúa.
`);
    expect(r.map((p) => p.element.type)).toEqual(["banner", "banner", "seleccion_unica"]);
    expect((r[1]!.element as any).label).toBe("Información adicional y guía para preguntas");
  });
});
