import type { FormElement } from "./form-schema.js";

// Registry de tipos de componente (ver docs/engines/components.md).
// Única fuente de verdad de metadata de tipo (etiqueta, si captura
// respuesta, versión de su forma) — reemplaza estructuras equivalentes
// que antes vivían duplicadas en la UI del Builder (VS-007).

export interface ComponentDefinition {
  type: FormElement["type"];
  label: string;
  isQuestion: boolean;
  version: number;
}

// Sin anotación de tipo explícita a propósito: `satisfies` (no `:`) verifica
// que cada entrada cumpla ComponentDefinition SIN ensanchar los literales
// (type/isQuestion/version). Si se anotara como `: readonly
// ComponentDefinition[]`, TypeScript ensancharía cada `type` a
// FormElement["type"] genérico, y el chequeo de exhaustividad de abajo
// quedaría vacío (compararía el tipo declarado consigo mismo, no el
// contenido real del array).
export const componentRegistry = [
  { type: "texto_corto", label: "Texto corto", isQuestion: true, version: 1 },
  { type: "texto_largo", label: "Texto largo", isQuestion: true, version: 1 },
  { type: "numero", label: "Número", isQuestion: true, version: 1 },
  { type: "seleccion_unica", label: "Selección única", isQuestion: true, version: 1 },
  { type: "seleccion_multiple", label: "Selección múltiple", isQuestion: true, version: 1 },
  { type: "seleccion_desplegable", label: "Selección desplegable", isQuestion: true, version: 1 },
  { type: "instruccion", label: "Instrucción", isQuestion: false, version: 1 },
  { type: "banner", label: "Banner", isQuestion: false, version: 1 },
  { type: "evidencia", label: "Evidencia", isQuestion: true, version: 1 },
  { type: "url_publica", label: "URL pública", isQuestion: true, version: 1 },
  { type: "calculado", label: "Calculado", isQuestion: true, version: 1 },
] as const satisfies readonly ComponentDefinition[];

// Numeración automática de preguntas (VS-021, ver docs/engines/form.md,
// "Numeración automática de preguntas"). `questionIndex` = posición 0-based
// dentro de la lista ya filtrada a isQuestion (y a visibleIf en el Runtime)
// — reinicia en cada Subindicador, no es un contador global.
export function questionNumber(questionIndex: number): string {
  return `0.${questionIndex + 1}`;
}

// Chequeo de exhaustividad en compile-time: si FormElement["type"] gana o
// pierde un tipo sin actualizar componentRegistry en el mismo cambio, esta
// asignación deja de compilar (ambos conjuntos de tipos deben ser idénticos,
// no solo uno subconjunto del otro). No se ejecuta en runtime, es
// puramente un candado de tipos.
type RegistryType = (typeof componentRegistry)[number]["type"];
type AssertSameSet<A extends string, B extends string> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : never
  : never;
const _componentRegistryIsExhaustive: AssertSameSet<RegistryType, FormElement["type"]> = true;
void _componentRegistryIsExhaustive;
