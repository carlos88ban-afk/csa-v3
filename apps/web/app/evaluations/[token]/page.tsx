"use client";

import type { Evaluation } from "@plataforma-csa/sdk-core";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Pill } from "@/components/ui";

interface Props {
  params: Promise<{ token: string }>;
}

// Página pública (ver docs/engines/publishing.md): sin sesión, sin
// requireActiveMember del lado del API. Solo lectura — capturar respuestas
// es M7 (engine/persistence), no este slice.

export default function PublicEvaluationPage({ params }: Props) {
  const { token } = use(params);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api
      .get<{ evaluation: Evaluation }>(`/api/public/evaluations/${token}`)
      .then((res) => setEvaluation(res.evaluation))
      .catch(() => setNotFound(true));
  }, [token]);

  if (notFound) return <main className="page">Este enlace no existe o ya no está disponible.</main>;
  if (!evaluation) return <main className="loading">Cargando...</main>;

  const { snapshot } = evaluation;

  return (
    <main className="page page--wide">
      <div>
        <Pill variant="accent">Evaluación publicada</Pill>
        <h1 style={{ marginTop: "var(--space-2)" }}>{snapshot.frameworkName}</h1>
        {snapshot.frameworkDescription && <p>{snapshot.frameworkDescription}</p>}
      </div>

      <div className="eval-tree">
        {snapshot.dimensions.map((dim) => (
          <section key={dim.id} className="eval-dimension">
            <h2>{dim.title}</h2>
            {dim.description && <p>{dim.description}</p>}

            {dim.indicators.map((ind) => (
              <div key={ind.id} className="eval-indicator">
                <h3>{ind.title}</h3>
                {ind.description && <p>{ind.description}</p>}

                {ind.subindicators.map((sub) => (
                  <div key={sub.id} className="eval-subindicator">
                    <strong>{sub.title}</strong>
                    {sub.description && <p>{sub.description}</p>}
                    {!sub.formSchema || sub.formSchema.elements.length === 0 ? (
                      <p className="empty">Este formulario todavía no tiene elementos.</p>
                    ) : (
                      <ol className="eval-elements">
                        {sub.formSchema.elements.map((el) => (
                          <li key={el.id} className="eval-element">
                            <span>{el.label || <em>(sin texto)</em>}</span>
                            {"required" in el && el.required && <Pill variant="warn">obligatorio</Pill>}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
