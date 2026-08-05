"use client";

import type { Evaluation } from "@plataforma-csa/sdk-core";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

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

  if (notFound) return <main>Este enlace no existe o ya no está disponible.</main>;
  if (!evaluation) return <main>Cargando...</main>;

  const { snapshot } = evaluation;

  return (
    <main>
      <h1>{snapshot.frameworkName}</h1>
      {snapshot.frameworkDescription && <p>{snapshot.frameworkDescription}</p>}

      {snapshot.dimensions.map((dim) => (
        <section key={dim.id}>
          <h2>{dim.title}</h2>
          {dim.description && <p>{dim.description}</p>}

          {dim.indicators.map((ind) => (
            <div key={ind.id}>
              <h3>{ind.title}</h3>
              {ind.description && <p>{ind.description}</p>}

              {ind.subindicators.map((sub) => (
                <div key={sub.id}>
                  <h4>{sub.title}</h4>
                  {sub.description && <p>{sub.description}</p>}
                  {!sub.formSchema || sub.formSchema.elements.length === 0 ? (
                    <p>Este formulario todavía no tiene elementos.</p>
                  ) : (
                    <ol>
                      {sub.formSchema.elements.map((el) => (
                        <li key={el.id}>
                          {el.label || <em>(sin texto)</em>}
                          {"required" in el && el.required ? " *" : ""}
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
    </main>
  );
}
