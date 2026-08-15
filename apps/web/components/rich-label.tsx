"use client";

import type { ReactNode } from "react";
import { sanitizeCommentHtml } from "@plataforma-csa/sdk-core";

// Labels de Elemento/opción/sub-opción con formato (VS-045, docs/engines/
// form.md "Formato en preguntas y opciones"): renderiza el label como HTML
// sanitizado en el borde de lectura (defensa en profundidad, mismo criterio
// que banner.content en VS-038 — aunque el Builder ya sanitizó al guardar).
// `fallback` se renderiza cuando la cadena está vacía: el autosave del
// Builder guarda borradores con labels vacíos (mismo criterio que
// `{element.label || <em>(sin texto)</em>}` que reemplaza).
export function RichLabel({ html, fallback }: { html: string; fallback?: ReactNode }) {
  if (!html.trim()) return fallback ?? null;
  return <span dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(html) }} />;
}