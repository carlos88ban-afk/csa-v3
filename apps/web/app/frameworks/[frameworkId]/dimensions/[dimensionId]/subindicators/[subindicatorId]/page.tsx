import { redirect } from "next/navigation";

// VS-031 (docs/slices/VS-031.md): la página editora de subindicador se
// consolidó en el workspace split-view /frameworks/[frameworkId]/builder.
// Este deep link redirige al workspace con el subindicador seleccionado
// (?s=). La lógica del editor vive en components/subindicator-editor.tsx.
//
// VS-048 (docs/engines/form.md "Grilla uniforme sin encabezados
// especiales"): esta ruta (subindicador directo bajo Dimensión, sin
// Indicador) nunca se convirtió al redirect en VS-031 — quedó como una
// implementación completa y duplicada del editor, sin ningún link real que
// apuntara a ella (huérfana, confirmado con grep en todo apps/web) y sin
// actualizar desde VS-024 (no llegó ni a VS-044). Rompía la compilación al
// eliminar `column.label`/`row.label`/el atajo de fila legacy del schema de
// `tabla_datos` — se convierte al mismo patrón de redirect que ya usan sus
// 3 rutas hermanas en vez de portar ~1000 líneas de código muerto.

interface Props {
  params: Promise<{
    frameworkId: string;
    dimensionId: string;
    subindicatorId: string;
  }>;
}

export default async function RedirectDimensionSubindicatorPage({ params }: Props) {
  const { frameworkId, subindicatorId } = await params;
  redirect(`/frameworks/${frameworkId}/builder?s=${subindicatorId}`);
}
