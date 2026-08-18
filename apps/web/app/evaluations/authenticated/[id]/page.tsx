"use client";

// VS-054/058 (docs/domain/business-units.md, "Acceso del evaluado"): Runtime
// autenticado por unidad de negocio — reemplaza el token público para
// Evaluaciones en modo corporativo (con asignaciones). Wrapper delgado sobre
// RuntimeCore (misma UI/autosave que el Runtime público, ver
// evaluations/[token]/page.tsx), armando el adapter con las rutas
// autenticadas de VS-053/054. `evidenceToken` acá es la URL base de las
// rutas espejo for-business-unit/evidences (VS-058) — mismo valor que el
// Runtime público le pasa a EvidenceView/OptionReferencesView, apuntando a
// rutas distintas.
import type { Evaluation, ResponseAnswers } from "@plataforma-csa/sdk-core";
import { use, useMemo } from "react";
import { api } from "@/lib/api-client";
import { RuntimeCore, type RuntimeAdapter } from "@/app/evaluations/[token]/page";

interface Props {
  params: Promise<{ id: string }>;
}

export default function AuthenticatedEvaluationPage({ params }: Props) {
  const { id } = use(params);
  const adapter = useMemo<RuntimeAdapter>(
    () => ({
      fetchEvaluation: () =>
        api.get<{ evaluation: Evaluation }>(`/api/evaluations/${id}/for-business-unit`).then((res) => res.evaluation),
      fetchResponses: () =>
        api
          .get<{ responses: Array<{ subindicatorId: string; answers: ResponseAnswers }> }>(
            `/api/evaluations/${id}/for-business-unit/responses`,
          )
          .then((res) => res.responses),
      saveResponse: (subindicatorId, answers) =>
        api.put(`/api/evaluations/${id}/for-business-unit/responses/${subindicatorId}`, { answers }),
    }),
    [id],
  );
  const evidenceBase = `/api/evaluations/${id}/for-business-unit/evidences`;
  return <RuntimeCore adapter={adapter} evidenceToken={evidenceBase} />;
}
