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

// Sub-opciones a 2 niveles (VS-026, docs/engines/form.md "Sub-opciones a 2
// niveles"): tope fijo en 2, no recursión genérica — subSubOption no tiene
// su propio subOptions. Sin caso observado de un 3er nivel; aditivo si
// aparece (repetir el mismo patrón un nivel más), no rediseño.
const subSubOption = z.object({ id: z.string().min(1), label: z.string() });

// Campo opcional en formOption/subOption, reusado en ambos (VS-039/VS-040).
// `position` (VS-041, docs/engines/form.md "Corrección posterior: posición
// configurable"): el HTML real de S&P pone la fila de referencias
// INMEDIATAMENTE después de la opción, antes de la sub-pregunta anidada —
// default `before_suboptions` (ausente = antes) replica eso; el usuario
// pidió poder elegirlo explícitamente en vez de un orden fijo.
const optionReferences = z.object({
  maxUrls: z.number().int().positive().optional(), // default 3 (límite observado en S&P)
  position: z.enum(["before_suboptions", "after_suboptions"]).optional(),
  // VS-045 (docs/engines/form.md "Formato en preguntas y opciones +
  // referencias flexibles"): `flexible` = cada slot admite URL pública O
  // documento interno (adjunto R2). Ausente = `public` (comportamiento
  // VS-039). Un solo refType por bloque — S&P lo define a nivel de bloque.
  refType: z.enum(["public", "flexible"]).optional(),
});

// Campo embebido en una sub-opción (VS-040, docs/engines/form.md "Campos
// embebidos en sub-opciones"): hallazgo del mismo HTML de S&P que VS-039 — la
// sub-opción "% de ingresos cubierto" trae su propio <select> de rangos.
// Solo nivel 1 (subOption), no subSubOption — ver "Fuera de alcance" del doc.
const subOptionFieldOption = z.object({ id: z.string().min(1), label: z.string() });
// VS-069 (docs/engines/form.md "Referencias y campos adicionales por
// celda"): `label` opcional — hallazgo real (MAT_MaterialIssues_Selection):
// una celda de tabla puede mostrar 2+ de estos campos juntos ("Tipo de
// impacto:" etiqueta un <select> revelado junto a un campo de texto sin
// etiqueta propia) y sin nombre no hay forma de distinguirlos. No afecta
// los usos existentes (subOption.field/formOption.field) — campo opcional,
// solo se renderiza si está presente.
const subOptionField = z.discriminatedUnion("type", [
  z.object({ type: z.literal("seleccion_desplegable"), label: z.string().optional(), options: z.array(subOptionFieldOption).min(1) }),
  z.object({ type: z.literal("texto_corto"), label: z.string().optional(), maxLength: z.number().int().positive().optional() }),
  z.object({
    type: z.literal("numero"),
    label: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    unit: z.string().min(1).optional(),
  }),
]);

// Tabla de datos (VS-024, luego VS-048 "Grilla uniforme sin encabezados
// especiales"): grilla de celdas — cada celda tiene su propio tipo.
// `options` solo aplica si cellType === "seleccion_desplegable", `unit`/
// `availableUnits` solo si cellType === "numero", `maxLength` solo si
// cellType === "texto" — no expresado como discriminated union anidado
// (costo de complejidad no justificado, ver el doc), lo exige el Builder.
// VS-061 (docs/engines/form.md "Celda de tabla tipo casilla con texto
// revelado"): "casilla" es una celda editable de valor booleano ("true"/"")
// — mismo patrón que naKey/markedNA, sin ensanchar tableCellValue.
// VS-067 (docs/engines/form.md "Adjuntar archivos o enlaces por celda"):
// "referencia" — la celda no guarda un valor propio en tableCellValue, usa
// el mismo mecanismo de slots que optionReferences (ver abajo) bajo una
// clave sintética, igual que "casilla"/revealField (VS-065).
const formTableCellType = z.enum(["texto", "numero", "seleccion_desplegable", "calculado", "casilla", "referencia"]);

// VS-048 (docs/engines/form.md "Grilla uniforme sin encabezados especiales"):
// sin `label` — la grilla es uniforme, cualquier celda (incluida la esquina
// superior izquierda) puede actuar como encabezado marcándola "solo
// lectura" con contenido (formTableCell.editable/content); no hay un
// concepto de "columna con etiqueta" separado de las celdas. `id` es solo
// identidad/orden estable, usada por `cells[].columnId` y por las
// referencias `{rowId.columnId}` de la fórmula (VS-043).
const formTableColumn = z.object({
  id: z.string().min(1),
});

// VS-042 (docs/engines/form.md "Tabla dentro de una sub-opción"): rompe el
// ciclo de tipos formTableRow -> formOption -> subOption -> tablaDatosConfig
// -> formTableRow. Las opciones de una fila (`seleccion_desplegable`) nunca
// usan `subOptions` en la práctica (id/label alcanzan), así que se tipan con
// `formOptionBase` (sin subOptions) — el contrato se estrecha sin romper
// nada: zod hace strip de claves desconocidas, un schema antiguo con
// subOptions en una opción de fila sigue validando (el campo se ignora).
const formOptionBase = z.object({
  id: z.string().min(1),
  label: z.string(),
  references: optionReferences.optional(),
  subOptionsExclusive: z.boolean().optional(),
});

// VS-044 (docs/engines/form.md "Tipo de celda mixto dentro de una fila"):
// tipo/config por CELDA (unit/availableUnits/options/maxLength), apuntando
// a una columna vía columnId. VS-048: desde este slice es la ÚNICA unidad
// de configuración — ya no existe un "tipo de fila legacy" del que esto sea
// un override.
// VS-043: `expression` es opcional y se valida cuando cellType === "calculado".
// VS-047 (docs/engines/form.md "Editor de tabla_datos estilo grilla"):
// `editable`/`content` — una celda con editable === false muestra `content`
// (HTML sanitizado, fijo, escrito por el admin) en vez de un control que
// llena el evaluado. Ausente = true (editable), mismo criterio que
// subOptionsExclusive/startCollapsed en el resto del motor — no `.default()`
// para no forzar el campo en cada literal existente.
// VS-063 (docs/engines/form.md "Contenido fijo como prefijo de una celda
// editable"): `content` ya no se ignora cuando editable !== false — si está
// presente en una celda editable, se renderiza como texto fijo ANTES del
// control interactivo (mismo `content`, mismo campo, sin cambio de schema).
//
// VS-074 (docs/engines/form.md "Fase 2: componentes independientes por
// celda"): shape del array `components` — cada componente es independiente
// (tipo/config/valor propios), a diferencia del modelo legacy de arriba
// ("1 control principal + companions de rol fijo"). Un discriminated union,
// mismo patrón que `formElement`. `gates` (solo en "casilla") reemplaza la
// regla implícita "extraFields solo se revela si cellType === 'casilla'"
// por una relación explícita entre componentes hermanos por `id`.
const tableCellComponent = z.discriminatedUnion("type", [
  z.object({ id: z.string().min(1), type: z.literal("texto_fijo"), content: z.string().optional() }),
  z.object({
    id: z.string().min(1),
    type: z.literal("texto_corto"),
    label: z.string().optional(),
    maxLength: z.number().int().positive().optional(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("numero"),
    label: z.string().optional(),
    // `min`/`max` (origen: extraFields legacy, subOptionField) y
    // `availableUnits` (origen: control principal legacy, numero de celda)
    // conviven en un solo tipo — unifica los 2 shapes distintos que
    // "numero" tenía en el modelo legacy según de dónde viniera.
    min: z.number().optional(),
    max: z.number().optional(),
    unit: z.string().min(1).optional(),
    availableUnits: z.array(z.string().min(1)).min(1).optional(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("seleccion_desplegable"),
    label: z.string().optional(),
    options: z.array(formOptionBase).min(1),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("casilla"),
    checkboxLabel: z.string().optional(),
    gates: z.array(z.string().min(1)).optional(),
  }),
  z.object({ id: z.string().min(1), type: z.literal("referencia"), references: optionReferences.optional() }),
  // `expression` sin `.min(1)` a propósito — el autosave del Builder guarda
  // estado intermedio (ej. la celda recién arrastrada, todavía sin fórmula
  // escrita), mismo criterio que `label` vacío en `questionBase` y que el
  // `expression` del `calculado` legacy (validado con `.trim() === ""` en
  // `synthesizeLegacyControl`, no con una constraint estructural del campo).
  z.object({ id: z.string().min(1), type: z.literal("calculado"), expression: z.string() }),
]);
export type TableCellComponent = z.infer<typeof tableCellComponent>;

const formTableCell = z.object({
  columnId: z.string().min(1),
  cellType: formTableCellType,
  expression: z.string().optional(),
  editable: z.boolean().optional(),
  content: z.string().optional(),
  unit: z.string().min(1).optional(),
  availableUnits: z.array(z.string().min(1)).min(1).optional(),
  options: z.array(formOptionBase).min(1).optional(),
  maxLength: z.number().int().positive().optional(),
  // VS-064 (docs/engines/form.md "Etiqueta propia de una celda casilla"):
  // texto de la propia casilla (el evaluado necesita entender qué está
  // marcando) — distinto de `content` (título/descripción de la celda,
  // ANTES del control). Solo aplica si cellType === "casilla".
  checkboxLabel: z.string().optional(),
  // VS-070 (docs/engines/form.md "Contenido fijo revelado en celdas casilla
  // + duplicar columna + hints"): contenido fijo (rich text) que se muestra
  // DENTRO del área revelada de una celda "casilla", tras marcar el
  // checkbox, ANTES de los extraFields. Distinto de `content` (siempre
  // visible, antes del control) y de `checkboxLabel` (etiqueta del propio
  // checkbox, siempre visible). Hallazgo real (MAT_MaterialIssues_Selection,
  // filas "Caso de negocio"/"Estrategias empresariales"): un párrafo fijo
  // aparece recién al marcar, junto a los campos. Solo aplica si
  // cellType === "casilla" (el único tipo con área revelada condicional).
  revealContent: z.string().optional(),
  // VS-069 (docs/engines/form.md "Referencias y campos adicionales por
  // celda"): reemplaza el `revealField: subOptionField` singular de VS-065
  // — reemplazo limpio, mismo criterio ya aplicado en VS-065
  // (revealText→revealField), sin datos reales confirmados dependiendo del
  // campo anterior. Hallazgo real (MAT_MaterialIssues_Selection): una celda
  // "casilla" puede revelar DOS campos juntos al marcarse (comentario +
  // selección de impacto), no solo uno. Además, ahora aplica a CUALQUIER
  // cellType editable, no solo "casilla":
  //  - cellType === "casilla": los campos se revelan tras marcar el
  //    checkbox (mismo gating que el revealField singular anterior).
  //  - cualquier otro tipo editable (texto/numero/seleccion_desplegable):
  //    los campos se muestran SIEMPRE, como "campos compañeros" junto al
  //    control principal — caso real: la celda "Material N" combina un
  //    <select> (categoría, el cellType principal) con un campo de texto
  //    libre (nombre del tema) mostrado siempre junto a él.
  extraFields: z.array(subOptionField).min(1).optional(),
  // VS-066 (docs/engines/form.md "Combinar columnas (colspan)"): réplica
  // fiel de tablas reales de S&P con encabezados/celdas que abarcan más de
  // una columna (`<th colspan="2">`, `<td colspan="2">`). Ausente = 1 (sin
  // combinar), mismo criterio que el resto del motor — no `.default()`.
  // Las columnas cubiertas por el span de una celda anterior en la misma
  // fila no llevan celda propia (mismo criterio "grillas irregulares" de
  // VS-048: sin entrada = celda en blanco/cubierta).
  colSpan: z.number().int().min(2).optional(),
  // VS-067 (docs/engines/form.md "Adjuntar archivos o enlaces por celda"):
  // mismo `optionReferences` ya usado por formOption/subOption/pregunta
  // (VS-039/045/056) — el pedido del usuario ("que las celdas también
  // permitan subir archivos adjunto o enlaces como ya lo hacemos en otras
  // partes") es exactamente esa dualidad URL-o-documento-interno, no un
  // mecanismo nuevo. `position` no aplica a una celda (no tiene
  // sub-opciones) pero se deja sin tocar el tipo compartido — un campo no
  // usado en este contexto no daña nada, ya lo tolera zod.
  // VS-069 (docs/engines/form.md "Referencias y campos adicionales por
  // celda"): ya no exclusivo de cellType === "referencia" — hallazgo real
  // (MAT_MaterialIssues_Selection): la celda "Material N" adjunta
  // referencias Y ADEMÁS tiene un control principal (`seleccion_desplegable`)
  // propio, no solo referencias. Aplica a cualquier celda editable; para
  // cellType === "referencia" sigue siendo el ÚNICO contenido de la celda
  // (sin control principal propio), comportamiento sin cambios.
  references: optionReferences.optional(),
  // VS-074/075 (docs/engines/form.md "Fase 2: componentes independientes
  // por celda"): aditivo, celda por celda — cuando está presente tiene
  // prioridad TOTAL sobre los campos legacy de arriba para render/valor/
  // export (ver `normalizeCellComponents`). Nunca `.default()`, mismo
  // criterio que el resto de este archivo; ninguna celda existente se
  // reescribe al agregar este campo.
  components: z.array(tableCellComponent).min(1).optional(),
})
// VS-043: si cellType es "calculado", expression es obligatorio
.superRefine((cell, ctx) => {
  if (cell.cellType === "calculado" && (!cell.expression || cell.expression.trim() === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Se requiere expression cuando cellType es 'calculado'",
      path: ["expression"],
    });
  }
})

// VS-048 (docs/engines/form.md "Grilla uniforme sin encabezados
// especiales"): sin `label`, sin el atajo legacy uniforme (`cellType`/
// `unit`/`availableUnits`/`options`/`maxLength` a nivel de fila, VS-024) —
// toda fila se construye siempre celda por celda desde este slice. `cells`
// ya no es opcional: una fila sin ninguna celda no tiene sentido, no hay
// "modo legado" al que caer. La validación de `calculado` → `expression`
// vive en `formTableCell` (arriba) y sigue aplicando por celda sin cambios.
const formTableRow = z.object({
  id: z.string().min(1),
  cells: z.array(formTableCell).min(1),
});

// Shape reutilizado por el Elemento `tabla_datos` y por la tabla embebida de
// una sub-opción (VS-042) — un solo tipo zod, sin duplicación. Sin
// label/visibleIf propios: la tabla embebida hereda los de la sub-opción.
const tablaDatosConfig = z.object({
  columns: z.array(formTableColumn).min(1),
  rows: z.array(formTableRow).min(1),
});

// Tipos nombrados exportados: los consumidores (Runtime, Preview, Builder,
// export CSV) comparten UNA instancia tipada en vez de derivar con Extract
// por su cuenta — los tipos recursivos del schema (formTableRow -> formOption
// -> subOption -> tablaDatosConfig -> formTableRow) se duplican en identidad
// al expandirse por rutas distintas y TypeScript los declara "unrelated"
// (TS2719), aunque sean estructuralmente idénticos.
export type FormTableColumn = z.infer<typeof formTableColumn>;
export type FormTableCell = z.infer<typeof formTableCell>;
export type FormTableRow = z.infer<typeof formTableRow>;
export type TablaDatosConfig = z.infer<typeof tablaDatosConfig>;

// VS-074/075 (docs/engines/form.md "Fase 2: componentes independientes por
// celda", tabla "Origen legacy → Componente sintetizado"): ids DETERMINISTAS
// (no crypto.randomUUID()) — deben ser los mismos en cada llamada para que
// las claves sintéticas de respuesta (`${...}::${component.id}`) no cambien
// entre renders de una misma celda legacy.
const LEGACY_CONTENT_ID = "legacy-content";
const LEGACY_CONTROL_ID = "legacy-control";
const LEGACY_REVEAL_CONTENT_ID = "legacy-reveal-content";
const LEGACY_REFERENCES_ID = "legacy-references";
function legacyExtraId(index: number): string {
  return `legacy-extra-${index}`;
}

// Reconstruye el `TableCellComponent` del control principal legacy
// (`cellType` + su config específica) — mapeo 1:1, ver tabla en el doc.
// `undefined` si la celda no alcanza a tener un control válido todavía
// (ej. `seleccion_desplegable` recién creada sin opciones, `calculado` sin
// expression) — mismo criterio de tolerancia que el resto del motor con
// autosave (guarda/lee estado intermedio, no exige completitud).
function synthesizeLegacyControl(cell: FormTableCell): TableCellComponent | undefined {
  switch (cell.cellType) {
    case "texto":
      return { id: LEGACY_CONTROL_ID, type: "texto_corto", maxLength: cell.maxLength };
    case "numero":
      return { id: LEGACY_CONTROL_ID, type: "numero", unit: cell.unit, availableUnits: cell.availableUnits };
    case "seleccion_desplegable":
      return cell.options?.length
        ? { id: LEGACY_CONTROL_ID, type: "seleccion_desplegable", options: cell.options }
        : undefined;
    case "casilla":
      return { id: LEGACY_CONTROL_ID, type: "casilla", checkboxLabel: cell.checkboxLabel, gates: undefined };
    case "referencia":
      return { id: LEGACY_CONTROL_ID, type: "referencia", references: cell.references };
    case "calculado":
      return cell.expression?.trim() ? { id: LEGACY_CONTROL_ID, type: "calculado", expression: cell.expression } : undefined;
  }
}

// VS-074/075: sintetiza el array de componentes equivalente a una celda
// legacy (sin `components` propio) — orden y reglas exactas documentadas en
// docs/engines/form.md ("Fase 2: componentes independientes por celda").
function synthesizeLegacyComponents(cell: FormTableCell): TableCellComponent[] {
  // "calculado" es de solo lectura por naturaleza y se evalúa siempre sin
  // importar editable/content/extraFields/references (VS-047, "tercer modo
  // de renderizado") — corto-circuito, ninguna otra regla de esta función
  // aplica.
  if (cell.cellType === "calculado") {
    const control = synthesizeLegacyControl(cell);
    return control ? [control] : [];
  }

  if (cell.editable === false) {
    return cell.content ? [{ id: LEGACY_CONTENT_ID, type: "texto_fijo", content: cell.content }] : [];
  }

  const control = synthesizeLegacyControl(cell);
  const contentComponent: TableCellComponent | undefined = cell.content
    ? { id: LEGACY_CONTENT_ID, type: "texto_fijo", content: cell.content }
    : undefined;
  const referencesComponent: TableCellComponent | undefined =
    cell.cellType !== "referencia" && cell.references
      ? { id: LEGACY_REFERENCES_ID, type: "referencia", references: cell.references }
      : undefined;
  const extraComponents: TableCellComponent[] = (cell.extraFields ?? []).map((field, index) =>
    field.type === "seleccion_desplegable"
      ? { id: legacyExtraId(index), type: "seleccion_desplegable", label: field.label, options: field.options }
      : field.type === "texto_corto"
        ? { id: legacyExtraId(index), type: "texto_corto", label: field.label, maxLength: field.maxLength }
        : { id: legacyExtraId(index), type: "numero", label: field.label, min: field.min, max: field.max, unit: field.unit },
  );

  if (cell.cellType === "casilla") {
    const revealContentComponent: TableCellComponent | undefined = cell.revealContent
      ? { id: LEGACY_REVEAL_CONTENT_ID, type: "texto_fijo", content: cell.revealContent }
      : undefined;
    const gatedIds = [
      ...(revealContentComponent ? [LEGACY_REVEAL_CONTENT_ID] : []),
      ...extraComponents.map((c) => c.id),
    ];
    const gatedControl: TableCellComponent | undefined =
      control && control.type === "casilla" ? { ...control, gates: gatedIds.length > 0 ? gatedIds : undefined } : control;
    return [
      ...(referencesComponent ? [referencesComponent] : []),
      ...(contentComponent ? [contentComponent] : []),
      ...(gatedControl ? [gatedControl] : []),
      ...(revealContentComponent ? [revealContentComponent] : []),
      ...extraComponents,
    ];
  }

  return [
    ...(referencesComponent ? [referencesComponent] : []),
    ...extraComponents,
    ...(contentComponent ? [contentComponent] : []),
    ...(control ? [control] : []),
  ];
}

// VS-074/075: adaptador de lectura no destructivo — Runtime/Preview/Export/
// Builder llaman SIEMPRE a esta función en vez de leer `cell.cellType`
// directo. Celdas con `components` propio: prioridad total, se devuelven
// tal cual. Celdas legacy: se sintetiza el equivalente, sin reescribir
// ningún dato (ver docs/engines/form.md "Fase 2: componentes independientes
// por celda").
export function normalizeCellComponents(cell: FormTableCell): TableCellComponent[] {
  if (cell.components?.length) return cell.components;
  return synthesizeLegacyComponents(cell);
}

const subOption = z.object({
  id: z.string().min(1),
  label: z.string(),
  subOptions: z.array(subSubOption).optional(),
  // VS-068 (docs/engines/form.md "Exclusividad y encabezado del bloque
  // primario de sub-opciones"): equivalente de `formOptionBase.subOptionsExclusive`
  // pero UN NIVEL MÁS ADENTRO — controla si LAS PROPIAS `subOptions` de esta
  // sub-opción (subSubOption[], nivel 2) se marcan como radio (excluyente) o
  // checkbox (ausente/false). Faltaba desde VS-026: el nivel 2 quedaba
  // hardcodeado a checkbox en Runtime/Preview — hallazgo real (HTML
  // COG_ESGGovernanceOversight_Selection): "BoardLevelCommittee" es un grupo
  // de radios revelado al marcar la sub-opción "BoardLevel".
  subOptionsExclusive: z.boolean().optional(),
  references: optionReferences.optional(), // VS-040: mismo campo que formOption.references
  field: subOptionField.optional(), // VS-040: campo embebido (select/texto/número)
  table: tablaDatosConfig.optional(), // VS-042: tabla embebida (mismo shape que tabla_datos)
});
// Referencias de URL por opción (VS-039, docs/engines/form.md "Referencias de
// URL por opción"): hallazgo de la 4.ª inspección — S&P adjunta la fila de
// referencias DENTRO de la opción de un radio, no como Elemento `url_publica`
// separado. Campo opcional, compatible hacia atrás; misma clave sintética
// que el 3er nivel de sub-opciones (`${elementId}::${optionId}::refs`), sin
// cambios en response.ts.
const formOption = formOptionBase.extend({
  subOptions: z.array(subOption).optional(),
  // VS-068 (docs/engines/form.md "Exclusividad y encabezado del bloque
  // primario de sub-opciones"): encabezado propio del bloque PRIMARIO
  // (`subOptions`), mismo campo que `secondaryOptionsHeading` (VS-046) pero
  // para el primer bloque — hallazgo real: HTML con DOS bloques de
  // sub-opciones con encabezado propio bajo la misma opción ("Supervisión de
  // la Junta" / "Supervisión ejecutiva"), y el bloque primario no tenía
  // dónde guardar el suyo (solo el secundario lo tenía).
  subOptionsHeading: z.string().optional(),
  // VS-046 (docs/engines/form.md "Bloque secundario de sub-opciones por
  // opción"): segundo bloque de sub-opciones, HERMANO de `subOptions` (no
  // anidado dentro de él) — caso real: la opción "Applicable" de
  // COG_BoardIndependence_Selection trae un sub-radio (StockExchange) Y, por
  // separado, un grupo de checkboxes con encabezado propio ("Distribución de
  // objetivos"). Mismo shape que subOptions/subOptionsExclusive, tope fijo en
  // 2 bloques (no un array genérico de N grupos), mismo criterio ya usado
  // para sub-opciones a 2 niveles (VS-026).
  secondaryOptionsHeading: z.string().optional(),
  secondaryOptions: z.array(subOption).optional(),
  secondaryOptionsExclusive: z.boolean().optional(),
  // VS-060 (docs/engines/form.md "Tabla embebida directamente en una opción
  // de nivel superior"): mismo campo que subOption.table (VS-042), un nivel
  // menos de anidación — caso real: una opción de seleccion_unica trae una
  // tabla completa colgando directo de ella, sin sub-radio intermedio.
  table: tablaDatosConfig.optional(),
  // VS-062 (docs/engines/form.md "Campo embebido directo en una opción de
  // nivel superior"): mismo campo que subOption.field (VS-040), un nivel
  // menos de anidación — caso real: la opción "Sí" de
  // COG_DisclosureMedian_Selection trae un campo "Moneda:" colgando directo
  // de ella, antes de la tabla, sin sub-radio intermedio.
  field: subOptionField.optional(),
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
    // Unidad por campo numérico (VS-023): `unit` es la unidad fija mostrada;
    // `availableUnits`, si está presente, hace que el evaluado elija entre
    // varias (el Runtime muestra un <select> en vez de texto fijo). Ambos
    // opcionales e independientes en el tipo — mutuamente excluyentes solo
    // por convención de UI, no por regla de validación (ver docs/engines/form.md).
    unit: z.string().min(1).optional(),
    availableUnits: z.array(z.string().min(1)).min(1).optional(),
  }),
  z.object({
    ...questionBase,
    type: z.literal("seleccion_unica"),
    options: z.array(formOption).min(1),
    // VS-056 (docs/engines/form.md "Referencias a nivel de pregunta"): bloque
    // de referencias entre el texto de la pregunta y las opciones, mismo
    // shape que las de opción. `position` no aplica a este nivel (no hay
    // sub-opciones que ordenar): el Runtime lo renderiza siempre entre texto
    // y opciones; el Builder no expone el selector de posición.
    references: optionReferences.optional(),
  }),
  z.object({
    ...questionBase,
    type: z.literal("seleccion_multiple"),
    options: z.array(formOption).min(1),
    minSelected: z.number().int().nonnegative().optional(),
    maxSelected: z.number().int().positive().optional(),
    references: optionReferences.optional(),
  }),
  // Select dropdown (VS-022): mismo `formOption` que seleccion_unica, misma
  // forma de respuesta (string = id elegido). subOptions no se usa en la
  // práctica en un dropdown (ver docs/engines/form.md) pero no se excluye
  // del tipo por simplicidad de reuso de formOption.
  z.object({
    ...questionBase,
    type: z.literal("seleccion_desplegable"),
    options: z.array(formOption).min(1),
  }),
  z.object({
    ...formElementBase,
    type: z.literal("instruccion"),
    label: z.string(),
  }),
  z.object({
    ...formElementBase,
    type: z.literal("banner"),
    label: z.string(), // Título — visible siempre, incluso contraído.
    // Título/contenido separados + estado inicial (VS-037, docs/engines/form.md,
    // supersede VS-025). content: visible solo si el banner está expandido.
    content: z.string(),
    variant: z.enum(["info", "warning"]),
    // Reemplaza expandable (VS-025): todo banner ahora es contraíble/expandible
    // por el evaluado — esto solo define el estado inicial (default false =
    // arranca expandido).
    startCollapsed: z.boolean().optional(),
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
  // Tabla de datos (VS-024): el tipo de celda se define por FILA, no por
  // celda individual (ver docs/engines/form.md, "Decisión de diseño") — una
  // fila es una métrica con una unidad, las columnas son sus períodos.
  // Shape compartido con la tabla embebida de sub-opción (VS-042).
  z.object({
    ...questionBase,
    type: z.literal("tabla_datos"),
    ...tablaDatosConfig.shape,
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