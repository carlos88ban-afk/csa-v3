import { redirect } from "next/navigation";

// VS-031 (docs/slices/VS-031.md): la navegación por páginas anidadas se
// consolidó en el workspace split-view /frameworks/[frameworkId]/builder.
// Este deep link (dimensión) redirige al workspace con la dimensión
// seleccionada (?s=), que la normaliza a su primer subindicador.

interface Props {
  params: Promise<{ frameworkId: string; dimensionId: string }>;
}

export default async function RedirectDimensionPage({ params }: Props) {
  const { frameworkId, dimensionId } = await params;
  redirect(`/frameworks/${frameworkId}/builder?s=${dimensionId}`);
}