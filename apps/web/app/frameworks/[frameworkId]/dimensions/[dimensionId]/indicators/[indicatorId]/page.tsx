import { redirect } from "next/navigation";

// VS-031 (docs/slices/VS-031.md): la navegación por páginas anidadas se
// consolidó en el workspace split-view /frameworks/[frameworkId]/builder.
// Este deep link (indicador) redirige al workspace con el indicador
// seleccionado (?s=), que lo normaliza a su primer subindicador.

interface Props {
  params: Promise<{ frameworkId: string; dimensionId: string; indicatorId: string }>;
}

export default async function RedirectIndicatorPage({ params }: Props) {
  const { frameworkId, indicatorId } = await params;
  redirect(`/frameworks/${frameworkId}/builder?s=${indicatorId}`);
}