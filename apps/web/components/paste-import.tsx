"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clipboardToText } from "@/lib/html-to-text";
import { parsePastedText, stripCommentHtml, componentRegistry, type FormElement, type ParsedItem } from "@plataforma-csa/sdk-core";

const TYPE_CHOICES: { type: FormElement["type"]; label: string }[] = [
  { type: "texto_corto", label: "Texto corto" },
  { type: "texto_largo", label: "Texto largo" },
  { type: "numero", label: "Número" },
  { type: "fecha", label: "Fecha" },
  { type: "seleccion_unica", label: "Selección única" },
  { type: "seleccion_multiple", label: "Selección múltiple" },
  { type: "tabla_datos", label: "Tabla" },
  { type: "evidencia", label: "Evidencia" },
  { type: "url_publica", label: "URL" },
  { type: "banner", label: "Aviso" },
  { type: "instruccion", label: "Texto informativo" },
];

const SAMPLE = `Aviso: Esta sección requiere información pública

1. ¿Tiene política de eficiencia energética?
○ Sí
○ No

2. Consumo de energía
_____ kWh

3. Materiales reciclados (marque todos los que apliquen)
☐ Papel
☐ Vidrio
☐ Plástico

| Material | Objetivo | Evidencia |

Adjunte la evidencia de sustento`;

const version = (t: FormElement["type"]) => componentRegistry.find((c) => c.type === t)?.version ?? 1;

function plain(html: unknown) {
  return typeof html === "string" ? stripCommentHtml(html) : "";
}

// Cambia el tipo de un borrador conservando texto y opciones.
function convert(el: FormElement, type: FormElement["type"]): FormElement {
  if (el.type === type) return el;
  const label = "label" in el ? el.label : "";
  const help = "helpText" in el ? el.helpText : undefined;
  const options = "options" in el ? el.options : undefined;
  const id = el.id;
  const componentVersion = version(type);
  const common = { id, label, componentVersion, ...(help ? { helpText: help } : {}) };
  switch (type) {
    case "seleccion_unica":
    case "seleccion_multiple":
      return {
        ...common, type,
        options: options?.length ? options : [{ id: crypto.randomUUID(), label: "Sí" }, { id: crypto.randomUUID(), label: "No" }],
      } as FormElement;
    case "banner":
      return { id, type, label, content: "", variant: "info", componentVersion } as FormElement;
    case "instruccion":
      return { id, type, label, componentVersion } as FormElement;
    case "tabla_datos": {
      const c1 = crypto.randomUUID(), c2 = crypto.randomUUID();
      return { ...common, type, columns: [{ id: c1 }, { id: c2 }], rows: [{ id: crypto.randomUUID(), cells: [{ columnId: c1, cellType: "texto", editable: false, content: "Columna 1" }, { columnId: c2, cellType: "texto", editable: false, content: "Columna 2" }] }, { id: crypto.randomUUID(), cells: [{ columnId: c1, cellType: "texto", editable: true }, { columnId: c2, cellType: "texto", editable: true }] }], } as FormElement;
    }
    default:
      return { ...common, type } as FormElement;
  }
}

export function PasteImport({ initialText, onClose, onInsert }: {
  initialText: string;
  onClose: () => void;
  onInsert: (elements: FormElement[]) => void;
}) {
  const [text, setText] = useState(initialText);
  const [overrides, setOverrides] = useState<Record<string, FormElement["type"]>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    taRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Cambia el texto → se reinterpreta todo (los ajustes manuales se pierden a propósito:
  // el texto es la fuente de verdad mientras se escribe/pega).
  const parsed: ParsedItem[] = useMemo(() => parsePastedText(text), [text]);
  useEffect(() => { setOverrides({}); setRemoved(new Set()); }, [text]);

  const live = parsed.filter((p) => !removed.has(p.element.id));
  const review = live.filter((p) => p.confidence !== "alta" && !(p.element.id in overrides)).length;
  const finalEls = live.map((p) => {
    const t = overrides[p.element.id];
    return t ? convert(p.element, t) : p.element;
  });

  return (
    <div className="pi-backdrop" role="dialog" aria-modal="true" aria-label="Pegar cuestionario">
      <div className="pi">
        <header className="pi__head">
          <h2>Pegar cuestionario</h2>
          <p>Pega texto de Word, Excel, PDF o Typeform. Yo detecto preguntas, opciones, tablas y avisos; tú solo revisas.</p>
          <button type="button" className="pi__close" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>
        <div className="pi__body">
          <div className="pi__src">
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                const t = clipboardToText(e.clipboardData);
                if (t && t !== e.clipboardData.getData("text/plain")) { e.preventDefault(); setText(t); }
              }}
              placeholder={"Pega aquí tu cuestionario…\n\n¿Tiene política de eficiencia?\n○ Sí\n○ No"}
              aria-label="Texto del cuestionario"
              spellCheck={false}
            />
            {!text.trim() && (
              <button type="button" className="pi__sample" onClick={() => setText(SAMPLE)}>Ver un ejemplo</button>
            )}
          </div>
          <div className="pi__out" aria-live="polite">
            {live.length === 0 ? (
              <p className="pi__hint">Aquí aparecerán las preguntas detectadas.</p>
            ) : (
              <>
                <p className="pi__sum">
                  <strong>{live.length}</strong> {live.length === 1 ? "elemento detectado" : "elementos detectados"}
                  {review > 0 ? <> · <span className="pi__warn">{review} por revisar</span></> : <> · todo con buena confianza</>}
                </p>
                <ol className="pi__list">
                  {live.map((p, idx) => {
                    const el = finalEls[idx]!;
                    const t = el.type;
                    const opts = "options" in el ? el.options : [];
                    const dudoso = p.confidence !== "alta" && !(p.element.id in overrides);
                    return (
                      <li key={p.element.id} className={`pi__item${dudoso ? " pi__item--warn" : ""}`}>
                        <div className="pi__row">
                          <select
                            value={t}
                            className="pi__type"
                            aria-label="Tipo de respuesta"
                            onChange={(e) => setOverrides((o) => ({ ...o, [p.element.id]: e.target.value as FormElement["type"] }))}
                          >
                            {TYPE_CHOICES.map((c) => <option key={c.type} value={c.type}>{c.label}</option>)}
                          </select>
                          <span className="pi__label">{plain("label" in el ? el.label : "") || <em>(sin texto)</em>}</span>
                          <button type="button" className="pi__x" aria-label="Quitar" onClick={() => setRemoved((r) => new Set(r).add(p.element.id))}>✕</button>
                        </div>
                        {opts && opts.length > 0 && (
                          <div className="pi__opts">{opts.map((o) => plain(o.label)).join(" · ")}</div>
                        )}
                        {t === "numero" && "unit" in el && el.unit && <div className="pi__opts">Unidad: {el.unit}</div>}
                        {t === "tabla_datos" && <div className="pi__opts">{(el as { columns: unknown[] }).columns.length} columnas</div>}
                        <div className="pi__why">{dudoso ? "Revisar: " : ""}{p.reason}</div>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </div>
        </div>
        <footer className="pi__foot">
          <button type="button" className="pi__cancel" onClick={onClose}>Cancelar</button>
          <button type="button" className="pi__go" disabled={live.length === 0} onClick={() => onInsert(finalEls)}>
            Insertar {live.length || ""} {live.length === 1 ? "elemento" : "elementos"} en el documento
          </button>
        </footer>
      </div>
    </div>
  );
}
