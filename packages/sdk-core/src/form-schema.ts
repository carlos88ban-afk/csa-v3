import { z } from "zod";
import { extractExpressionReferences } from "./formula.js";
import { condition } from "./rule.js";

// Contrato del motor engine/form v1 (ver docs/engines/form.md), extendido en
// M10 con `calculado` (docs/engines/formula.md) y `visibleIf`
// (docs/engines/rule.md). schemaVersion versiona la *forma* de este JSON,
// independiente de revisionNumber (que versiona el *contenido*, en
// packages/db/src/schema/domain.ts).

// componentVersion: versión del registry (component-registry.ts) vigente al
// CREAR el elemento — no se reescribe al editar. Ver docs/engines/components.md.
// visibleIf: condición de visibilidad, ver docs/engines/rule.md — se agrega
// aquí (no en questionBase) porque cualquier tipo de Elemento puede
// necesitarla, no solo preguntas (ej. un banner condicional).
const formElementBase = {
  id: z.string().min(1),
  componentVersion: z.number().int().positive().optional(),
  visibleIf: condition.optional(),
};

// label/options[].label permiten vacío a propósito: el autosave del Builder
// guarda el estado del formulario mientras se edita (elemento recién
// agregado, opción recién agregada), no solo su estado "terminado". Que un
// elemento esté completo para publicarse es una validación de M6
// (engine/publishing), no una condición para poder guardar un borrador.
const questionBase = {
  ...formElementBase,
  label: z.string(),
  helpText: z.string().optional(),
  required: z.boolean().optional(),
};

const formOption = z.object({
  id: z.string().min(1),
  label: z.string(),
  subOptions: z.array(z.object({ id: z.string().min(1), label: z.string() })).optional(),
});

export const formElement = z.discriminatedUnion("type", [
  z.object({
    ...questionBase,
    type: z.literal("texto_corto"),
    maxLength: z.number().int().positive().optional(),
  }),
  z.object({
    ...questionBase,
    type: z.literal("texto_largo"),
    maxLength: z.number().int().positive().optional(),
  }),
  z.object({
    ...questionBase,
    type: z.literal("numero"),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  z.object({
    ...questionBase,
    type: z.literal("seleccion_unica"),
    options: z.array(formOption).min(1),
  }),
  z.object({
    ...questionBase,
    type: z.literal("seleccion_multiple"),
    options: z.array(formOption).min(1),
    minSelected: z.number().int().nonnegative().optional(),
    maxSelected: z.number().int().positive().optional(),
  }),
  z.object({
    ...formElementBase,
    type: z.literal("instruccion"),
    label: z.string(),
  }),
  z.object({
    ...formElementBase,
    type: z.literal("banner"),
    label: z.string(),
    variant: z.enum(["info", "warning"]),
  }),
  z.object({
    ...questionBase,
    type: z.literal("evidencia"),
    maxFiles: z.number().int().positive().optional(),
    maxSizeMb: z.number().positive().optional(),
    acceptedTypes: z.array(z.string().min(1)).optional(),
  }),
  z.object({
    ...questionBase,
    type: z.literal("url_publica"),
    maxUrls: z.number().int().positive().optional(),
  }),
  // Sin questionBase: no es una pregunta editada por el evaluado, el
  // Runtime escribe su valor automáticamente (ver docs/engines/formula.md,
  // "isQuestion: true" en component-registry.ts porque participa en
  // progreso/exportación como cualquier pregunta, pese a no tener `required`).
  z.object({
    ...formElementBase,
    type: z.literal("calculado"),
    label: z.string(),
    helpText: z.string().optional(),
    expression: z.string(),
    decimals: z.number().int().nonnegative().optional(),
  }),
]);
export type FormElement = z.infer<typeof formElement>;

// DFS con coloreo blanco/gris/negro sobre el subgrafo calculado→calculado
// (las referencias a `numero` o a ids inexistentes no forman parte del
// grafo — solo importan para detectar ciclos). Devuelve el primer ciclo
// encontrado como lista de ids, o null si no hay ninguno.
function findFormulaCycle(calculadoElements: Array<{ id: string; expression: string }>): string[] | null {
  const calculadoIds = new Set(calculadoElements.map((el) => el.id));
  const graph = new Map<string, string[]>(
    calculadoElements.map((el) => [el.id, extractExpressionReferences(el.expression).filter((id) => calculadoIds.has(id))]),
  );

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>(calculadoElements.map((el) => [el.id, WHITE]));

  function visit(id: string, path: string[]): string[] | null {
    color.set(id, GRAY);
    for (const next of graph.get(id) ?? []) {
      if (color.get(next) === GRAY) return [...path, next];
      if (color.get(next) === WHITE) {
        const found = visit(next, [...path, next]);
        if (found) return found;
      }
    }
    color.set(id, BLACK);
    return null;
  }

  for (const id of calculadoIds) {
    if (color.get(id) === WHITE) {
      const cycle = visit(id, [id]);
      if (cycle) return cycle;
    }
  }
  return null;
}

export const formSchema = z
  .object({
    schemaVersion: z.literal(1),
    elements: z.array(formElement),
  })
  // Validación cruzada entre Elementos (ver docs/engines/formula.md y
  // rule.md): ninguna de las dos reglas se puede expresar dentro de una
  // rama individual de `formElement`, necesitan ver el array completo.
  .superRefine((schema, ctx) => {
    for (const el of schema.elements) {
      if (el.visibleIf && el.visibleIf.elementId === el.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `visibleIf no puede referenciar al propio elemento (${el.id})`,
          path: ["elements"],
        });
      }
    }

    const calculadoElements = schema.elements.filter(
      (el): el is Extract<FormElement, { type: "calculado" }> => el.type === "calculado",
    );
    const cycle = findFormulaCycle(calculadoElements);
    if (cycle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Referencia circular en fórmulas: ${cycle.join(" → ")}`,
        path: ["elements"],
      });
    }
  });
export type FormSchema = z.infer<typeof formSchema>;
