import { z } from "zod";

// Contrato del motor engine/form v1 (ver docs/engines/form.md).
// Tipos de elemento v1: subconjunto de docs/domain/ubiquitous-language.md
// que no depende de motores futuros (engine/components M5, engine/formula
// y engine/rule M10). schemaVersion versiona la *forma* de este JSON,
// independiente de revisionNumber (que versiona el *contenido*, en
// packages/db/src/schema/domain.ts).

const formElementBase = {
  id: z.string().min(1),
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
]);
export type FormElement = z.infer<typeof formElement>;

export const formSchema = z.object({
  schemaVersion: z.literal(1),
  elements: z.array(formElement),
});
export type FormSchema = z.infer<typeof formSchema>;
