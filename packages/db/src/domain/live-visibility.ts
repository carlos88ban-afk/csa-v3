import {
  dimensionNumber,
  directSubindicatorNumber,
  indicatorNumber,
  subindicatorNumber,
  type EvaluationSnapshot,
} from "@plataforma-csa/sdk-core";
import { inArray, sql } from "drizzle-orm";
import { db } from "../client.js";
import { subindicator } from "../schema/domain.js";

type Sub = EvaluationSnapshot["dimensions"][number]["subindicators"][number];

/**
 * Prepara el snapshot para servirlo:
 * - Visibilidad EN VIVO: quién ve/responde cada tema (appliesTo) se lee del árbol actual, no de la copia
 *   tomada al publicar. Así cambiarla no exige actualizar la evaluación.
 * - Numeración oficial (1.1.3) calculada sobre la estructura completa, para que no cambie al filtrar por unidad.
 * Cualquier otro cambio (textos, preguntas, responsables) sigue viniendo de la copia publicada.
 */
export async function prepareSnapshot(snapshot: EvaluationSnapshot): Promise<EvaluationSnapshot> {
  const ids = snapshot.dimensions.flatMap((d) => [...d.indicators.flatMap((i) => i.subindicators), ...d.subindicators].map((s) => s.id));
  const live = new Map<string, string[] | null>();
  if (ids.length > 0) {
    const rows = await db
      .select({
        id: subindicator.id,
        applies: sql<unknown>`(select e->'appliesTo' from jsonb_array_elements(case when jsonb_typeof(${subindicator.formSchema}->'elements') = 'array' then ${subindicator.formSchema}->'elements' else '[]'::jsonb end) e where e->>'type' <> 'evidencia' limit 1)`,
      })
      .from(subindicator)
      .where(inArray(subindicator.id, ids));
    for (const r of rows) live.set(r.id, Array.isArray(r.applies) && r.applies.length > 0 ? (r.applies as string[]) : null);
  }
  const fix = (sub: Sub, number: string): Sub => {
    const out: Sub = { ...sub, number };
    if (!sub.formSchema || !live.has(sub.id)) return out;
    const applies = live.get(sub.id) ?? null;
    return {
      ...out,
      formSchema: {
        ...sub.formSchema,
        elements: sub.formSchema.elements.map((el) => {
          const { appliesTo: _old, ...rest } = el;
          return (applies ? { ...rest, appliesTo: applies } : rest) as typeof el;
        }),
      },
    };
  };
  return {
    ...snapshot,
    dimensions: snapshot.dimensions.map((d, di) => ({
      ...d,
      number: dimensionNumber(di),
      indicators: d.indicators.map((i, ii) => ({
        ...i,
        number: indicatorNumber(di, ii),
        subindicators: i.subindicators.map((s, si) => fix(s, subindicatorNumber(di, ii, si))),
      })),
      subindicators: d.subindicators.map((s, si) => fix(s, directSubindicatorNumber(di, d.indicators.length, si))),
    })),
  };
}
