import { redirect } from "next/navigation";

// VS-031 (docs/slices/VS-031.md): la página editora de subindicador se
// consolidó en el workspace split-view /frameworks/[frameworkId]/builder.
// Este deep link redirige al workspace con el subindicador seleccionado
// (?s=). La lógica del editor vive en components/subindicator-editor.tsx.

interface Props {
  params: Promise<{
    frameworkId: string;
    dimensionId: string;
    indicatorId: string;
    subindicatorId: string;
  }>;
}

export default async function RedirectSubindicatorPage({ params }: Props) {
  const { frameworkId, subindicatorId } = await params;
  redirect(`/frameworks/${frameworkId}/builder?s=${subindicatorId}`);
}