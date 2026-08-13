"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { Breadcrumb, Button, Pill } from "@/components/ui";
import { SubindicatorEditor } from "@/components/subindicator-editor";

// Tipos del árbol: el builder trabaja sobre la misma forma que el runtime
// (dimensiones → indicadores → subindicadores + subindicadores directos).
type TreeSubindicator = { id: string; title: string };
type TreeIndicator = { indicator: { id: string; title: string }; subs: TreeSubindicator[] };
type TreeDimension = {
  dimension: { id: string; title: string };
  indicators: TreeIndicator[];
  directSubs: TreeSubindicator[];
};
type CreateFormState = {
  kind: "dimension" | "indicator" | "sub" | "directSub";
  dimensionId?: string;
  indicatorId?: string;
  title: string;
  busy: boolean;
  error: string | null;
};

type RenameFormState = {
  kind: "dimension" | "indicator" | "sub";
  id: string;
  title: string;
  busy: boolean;
  error: string | null;
};

type DeleteConfirmState = {
  kind: "dimension" | "indicator" | "sub";
  id: string;
  title: string;
  busy: boolean;
  error: string | null;
};

// Numeración de subindicadores por posición global (misma convención que el
// runtime y el motor de resultados — docs/engines/scoring.md).
function dimensionNumber(index: number): string {
  return String(index + 1);
}

function indicatorNumber(dimIndex: number, indIndex: number): string {
  return `${dimIndex + 1}.${indIndex + 1}`;
}

function subindicatorNumber(dimIndex: number, indIndex: number, subIndex: number): string {
  return `${dimIndex + 1}.${indIndex + 1}.${subIndex + 1}`;
}

function directSubindicatorNumber(dimIndex: number, indCount: number, subIndex: number): string {
  return `${dimIndex + 1}.${indCount + 1}.${subIndex + 1}`;
}

// Resolución del foco ?s=: si apunta a un subindicador, ese; si apunta a una
// dimensión/indicador, su primer subindicador (o null si no tiene contenido).
function resolveFocus(tree: TreeDimension[], raw: string | null): string | null {
  const direct = (): string | null => {
    if (!raw) return null;
    const allSubs: TreeSubindicator[] = [];
    for (const d of tree) {
      for (const ind of d.indicators) allSubs.push(...ind.subs);
      allSubs.push(...d.directSubs);
    }
    const found = allSubs.find((s) => s.id === raw);
    if (found) return found.id;
    return null;
  };

  if (direct()) return direct();

  if (raw) {
    for (const d of tree) {
      if (d.dimension.id === raw && d.directSubs.length > 0) return d.directSubs[0]!.id;
      for (const ind of d.indicators) {
        if (ind.indicator.id === raw && ind.subs.length > 0) return ind.subs[0]!.id;
      }
    }
  }

  for (const d of tree) {
    if (d.directSubs.length > 0) return d.directSubs[0]!.id;
    for (const ind of d.indicators) {
      if (ind.subs.length > 0) return ind.subs[0]!.id;
    }
  }
  return null;
}

const KIND_META = {
  dimension: { noun: "Dimensión", renamed: "renombrada", deleted: "borrada" },
  indicator: { noun: "Indicador", renamed: "renombrado", deleted: "borrado" },
  sub: { noun: "Subindicador", renamed: "renombrado", deleted: "borrado" },
} as const;

export default function BuilderPage() {
  const params = useParams<{ frameworkId: string }>();
  const frameworkId = params.frameworkId;
  const searchParams = useSearchParams();
  const paramsObj = searchParams;

  const initialSelection = useMemo(() => ({ raw: paramsObj.get("s") }), [paramsObj]);
  const [{ raw: initialRaw }] = useState(initialSelection);

  const [framework, setFramework] = useState<{ id: string; name: string } | null>(null);
  const [dims, setDims] = useState<TreeDimension[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialRaw);
  const [focusId, setFocusId] = useState<string | null>(initialRaw);
  const [collapsedDims, setCollapsedDims] = useState<Set<number>>(new Set());
  const [collapsedInds, setCollapsedInds] = useState<Set<string>>(new Set());
  const [treeOpen, setTreeOpen] = useState<boolean>(() => !window.matchMedia("(max-width: 860px)").matches);
  const [creating, setCreating] = useState<CreateFormState | null>(null);
  const [renaming, setRenaming] = useState<RenameFormState | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<DeleteConfirmState | null>(null);
  const [treeMessage, setTreeMessage] = useState<string | null>(null);

  // VS-032 contrato 6: buscador local del árbol + asistente de creación de 4
  // pasos para frameworks (o dimensión única recién creada) sin contenido.
  const [query, setQuery] = useState("");
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardSession, setWizardSession] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      let fw: { id: string; name: string } | null = null;
      try {
        fw = await api.get<{ id: string; name: string }>(`/api/frameworks/${frameworkId}`);
      } catch (err) {
        setTreeMessage(err instanceof Error ? err.message : "No se pudo cargar el framework");
      }
      if (!alive) return;
      setFramework(fw);
    })();
    return () => {
      alive = false;
    };
  }, [frameworkId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [{ dimensions }] = await Promise.all([
          api.get<{ dimensions: { id: string; title: string }[] }>(`/api/dimensions?frameworkId=${frameworkId}`),
        ]);
        if (!alive) return;
        const tree: TreeDimension[] = [];
        for (const dimRow of dimensions) {
          const [{ indicators }] = await Promise.all([
            api.get<{ indicators: { id: string; title: string }[] }>(`/api/indicators?dimensionId=${dimRow.id}`),
          ]);
          const indWithSubs: TreeIndicator[] = [];
          for (const ind of indicators) {
            const [{ subindicators }] = await Promise.all([
              api.get<{ subindicators: TreeSubindicator[] }>(`/api/subindicators?indicatorId=${ind.id}`),
            ]);
            indWithSubs.push({ indicator: ind, subs: subindicators });
          }
          const [{ subindicators: directSubs }] = await Promise.all([
            api.get<{ subindicators: TreeSubindicator[] }>(`/api/subindicators?dimensionId=${dimRow.id}`),
          ]);
          tree.push({ dimension: dimRow, indicators: indWithSubs, directSubs });
        }

        const resolved = resolveFocus(tree, initialRaw);
        setSelectedId(resolved);
        setFocusId(resolved ?? initialRaw);
        window.history.replaceState(null, "", resolved ? `?s=${resolved}` : window.location.pathname);
        setDims(tree);
      } catch (err) {
        if (alive) setTreeMessage(err instanceof Error ? err.message : "No se pudo cargar la estructura");
      }
    })();
    return () => {
      alive = false;
    };
  }, [frameworkId, initialRaw]);

  const flat = useMemo<TreeSubindicator[]>(
    () => (dims ?? []).flatMap((d) => [...d.indicators.flatMap((i) => i.subs), ...d.directSubs]),
    [dims],
  );

  // Resultados de búsqueda: nodos cuyo título coincide, con su path humano.
  // Filtro local sobre `dims` (no API) — ver VS-032 contrato 6.
  type SearchResultItem = { id: string; title: string; path: string; kind: "dimension" | "indicator" | "sub" };
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !dims) return null;
    const out: SearchResultItem[] = [];
    for (let di = 0; di < dims.length; di++) {
      const d = dims[di]!;
      if (d.dimension.title.toLowerCase().includes(q)) {
        out.push({ id: d.dimension.id, title: d.dimension.title, path: `Dimensión ${dimensionNumber(di)}`, kind: "dimension" });
      }
      d.indicators.forEach((ind, ii) => {
        if (ind.indicator.title.toLowerCase().includes(q)) {
          out.push({ id: ind.indicator.id, title: ind.indicator.title, path: `${indicatorNumber(di, ii)} · ${d.dimension.title}`, kind: "indicator" });
        }
        ind.subs.forEach((s, si) => {
          if (s.title.toLowerCase().includes(q)) {
            out.push({ id: s.id, title: s.title, path: `${subindicatorNumber(di, ii, si)} · ${d.dimension.title} · ${ind.indicator.title}`, kind: "sub" });
          }
        });
      });
      d.directSubs.forEach((s, si) => {
        if (s.title.toLowerCase().includes(q)) {
          out.push({ id: s.id, title: s.title, path: `${directSubindicatorNumber(di, d.indicators.length, si)} · ${d.dimension.title}`, kind: "sub" });
        }
      });
    }
    return out;
  }, [dims, query]);

  // El asistente avanza automáticamente al completarse cada alta (los forms
  // inline del árbol ya reportan en treeMessage).
  useEffect(() => {
    if (!treeMessage) return;
    if (treeMessage.startsWith("Dimensión")) setWizardStep((s) => Math.max(s, 1));
    if (treeMessage.startsWith("Indicador")) setWizardStep((s) => Math.max(s, 2));
    if (treeMessage.startsWith("Subindicador")) setWizardStep((s) => Math.max(s, 3));
  }, [treeMessage]);

  useEffect(() => {
    if (!!dims && dims.length > 1) setWizardSession(false);
  }, [dims]);

  const activeIndex = useMemo(() => flat.findIndex((s) => s.id === selectedId), [flat, selectedId]);

  function activePath(): string | null {
    if (!dims || activeIndex < 0) return null;
    const id = flat[activeIndex]!.id;
    for (let di = 0; di < dims.length; di++) {
      const d = dims[di]!;
      for (let ii = 0; ii < d.indicators.length; ii++) {
        const i = d.indicators[ii]!;
        const si = i.subs.findIndex((s) => s.id === id);
        if (si >= 0) {
          return `${subindicatorNumber(di, ii, si)} · ${i.indicator.title} · ${i.subs[si]!.title}`;
        }
      }
      const si2 = d.directSubs.findIndex((s) => s.id === id);
      if (si2 >= 0) {
        return `${directSubindicatorNumber(di, d.indicators.length, si2)} · ${d.dimension.title} · ${d.directSubs[si2]!.title}`;
      }
    }
    return null;
  }

  function toggleDim(i: number) {
    setCollapsedDims((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function toggleInd(di: number, ii: number) {
    const key = `${di}:${ii}`;
    setCollapsedInds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectSub(id: string) {
    setSelectedId(id);
    setFocusId(id);
    setTreeOpen(false);
    setWizardSession(false);
  }

  // Resultado de búsqueda que no es subindicador: foco central (dimensión/
  // indicador vacío muestra su EmptyState con los CTAs de alta).
  // La propiedad kind no se re-narrowéa dentro de closures onClick; este
  // helper centraliza la navegación desde un resultado de búsqueda.
  function pickSearchResult(r: SearchResultItem) {
    if (r.kind === "sub") selectSub(r.id);
    else selectResult(r.kind, r.id);
  }

  function selectResult(kind: "dimension" | "indicator", id: string) {
    setSelectedId(id);
    setFocusId(id);
    setTreeOpen(false);
    window.history.replaceState(null, "", `?s=${id}`);
  }

  function openCreate(initial: Partial<CreateFormState> & { kind: CreateFormState["kind"] }) {
    setCreating({
      kind: initial.kind,
      title: "",
      busy: false,
      error: null,
      ...(initial.dimensionId ? { dimensionId: initial.dimensionId } : {}),
      ...(initial.indicatorId ? { indicatorId: initial.indicatorId } : {}),
    });
    setTreeOpen(true);
  }

  function closeCreate() {
    setCreating(null);
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!creating || creating.busy || creating.title.trim() === "") return;
    const c = creating;
    const title = c.title.trim();
    setCreating({ ...c, busy: true, error: null });
    try {
      if (c.kind === "dimension") {
        const { dimension } = await api.post<{ dimension: { id: string; title: string } }>("/api/dimensions", {
          frameworkId,
          title,
        });
        setDims((prev) => [...(prev ?? []), { dimension, indicators: [], directSubs: [] }]);
        setTreeMessage(`Dimensión ${dimension.title} creada`);
        setCreating(null);
        setFocusId(dimension.id);
      } else if (c.kind === "indicator" && c.dimensionId) {
        const { indicator } = await api.post<{ indicator: { id: string; title: string } }>("/api/indicators", {
          dimensionId: c.dimensionId,
          title,
        });
        setDims((prev) =>
          (prev ?? []).map((d) =>
            d.dimension.id === c.dimensionId ? { ...d, indicators: [...d.indicators, { indicator, subs: [] }] } : d,
          ),
        );
        setTreeMessage(`Indicador ${indicator.title} creado`);
        setCreating(null);
        // La selección pasa al indicador recién creado (panel de orientación
        // "crear subindicador") y el flujo continúa directo al primer sub.
        setSelectedId(indicator.id);
        setFocusId(indicator.id);
        window.history.replaceState(null, "", `?s=${indicator.id}`);
        openCreate({ kind: "sub", indicatorId: indicator.id });
      } else if (c.kind === "sub" && c.indicatorId) {
        const { subindicator } = await api.post<{ subindicator: { id: string; title: string } }>("/api/subindicators", {
          indicatorId: c.indicatorId,
          title,
        });
        setDims((prev) =>
          (prev ?? []).map((d) => ({
            ...d,
            indicators: d.indicators.map((i) =>
              i.indicator.id === c.indicatorId ? { ...i, subs: [...i.subs, subindicator] } : i,
            ),
          })),
        );
        setCollapsedDims((prev) => {
          const next = new Set(prev);
          (dims ?? []).forEach((d, di) => {
            if (d.indicators.some((i) => i.indicator.id === c.indicatorId)) next.delete(di);
          });
          return next;
        });
        setTreeMessage(`Subindicador ${subindicator.title} creado`);
        setCreating(null);
        // Con el asistente activo (VS-032) la selección NO salta al editor:
        // el paso 4 del wizard guía al primer elemento y deja decidir el
        // momento de "Empezar a editar".
        if (!wizardSession) selectSub(subindicator.id);
      } else if (c.kind === "directSub" && c.dimensionId) {
        const { subindicator } = await api.post<{ subindicator: { id: string; title: string } }>("/api/subindicators", {
          dimensionId: c.dimensionId,
          title,
        });
        setDims((prev) =>
          (prev ?? []).map((d) =>
            d.dimension.id === c.dimensionId ? { ...d, directSubs: [...d.directSubs, subindicator] } : d,
          ),
        );
        setCollapsedDims((prev) => {
          const next = new Set(prev);
          const di = (dims ?? []).findIndex((d) => d.dimension.id === c.dimensionId);
          if (di >= 0) next.delete(di);
          return next;
        });
        setTreeMessage(`Subindicador ${subindicator.title} creado`);
        setCreating(null);
        if (!wizardSession) selectSub(subindicator.id);
      }
    } catch (err) {
      setCreating((prev) =>
        prev ? { ...prev, busy: false, error: err instanceof Error ? err.message : "No se pudo crear" } : prev,
      );
    }
  }

  function startRename(kind: RenameFormState["kind"], id: string, title: string) {
    setCreating(null);
    setRenaming({ kind, id, title, busy: false, error: null });
  }

  function closeRename() {
    setRenaming(null);
  }

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renaming || renaming.busy || renaming.title.trim() === "") return;
    const r = renaming;
    const title = r.title.trim();
    setRenaming({ ...r, busy: true, error: null });
    try {
      if (r.kind === "dimension") {
        await api.patch(`/api/dimensions/${r.id}`, { title });
        setDims((prev) =>
          (prev ?? []).map((d) => (d.dimension.id === r.id ? { ...d, dimension: { ...d.dimension, title } } : d)),
        );
      } else if (r.kind === "indicator") {
        await api.patch(`/api/indicators/${r.id}`, { title });
        setDims((prev) =>
          (prev ?? []).map((d) => ({
            ...d,
            indicators: d.indicators.map((i) => (i.indicator.id === r.id ? { ...i, indicator: { ...i.indicator, title } } : i)),
          })),
        );
      } else {
        await api.patch(`/api/subindicators/${r.id}`, { title });
        setDims((prev) =>
          (prev ?? []).map((d) => ({
            ...d,
            indicators: d.indicators.map((i) => ({ ...i, subs: i.subs.map((s) => (s.id === r.id ? { ...s, title } : s)) })),
            directSubs: d.directSubs.map((s) => (s.id === r.id ? { ...s, title } : s)),
          })),
        );
      }
      setTreeMessage(`${KIND_META[r.kind].noun} "${title}" ${KIND_META[r.kind].renamed}`);
      setRenaming(null);
    } catch (err) {
      setRenaming((prev) =>
        prev ? { ...prev, busy: false, error: err instanceof Error ? err.message : "No se pudo renombrar" } : prev,
      );
    }
  }

  function requestDelete(kind: DeleteConfirmState["kind"], id: string, title: string) {
    setCreating(null);
    setRenaming(null);
    setConfirmingDelete({ kind, id, title, busy: false, error: null });
  }

  function cancelDelete() {
    setConfirmingDelete(null);
  }

  async function submitDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmingDelete || !dims) return;
    const c = confirmingDelete;
    const removedIdx = flat.findIndex((s) => s.id === c.id);
    setConfirmingDelete({ ...c, busy: true, error: null });
    try {
      if (c.kind === "dimension") {
        await api.del(`/api/dimensions/${c.id}`);
      } else if (c.kind === "indicator") {
        await api.del(`/api/indicators/${c.id}`);
      } else {
        await api.del(`/api/subindicators/${c.id}`);
      }

      const nextDims =
        c.kind === "dimension"
          ? dims.filter((d) => d.dimension.id !== c.id)
          : c.kind === "indicator"
            ? dims.map((d) => ({
                ...d,
                indicators: d.indicators.filter((i) => i.indicator.id !== c.id),
              }))
            : dims.map((d) => ({
                ...d,
                indicators: d.indicators.map((i) => ({ ...i, subs: i.subs.filter((s) => s.id !== c.id) })),
                directSubs: d.directSubs.filter((s) => s.id !== c.id),
              }));
      setDims(nextDims);

      const nextFlat = nextDims.flatMap((d) => [...d.indicators.flatMap((i) => i.subs), ...d.directSubs]);
      if (selectedId && !nextFlat.some((s) => s.id === selectedId)) {
        const fallback = nextFlat[Math.min(Math.max(removedIdx, 0), nextFlat.length - 1)] ?? null;
        setSelectedId(fallback?.id ?? null);
        setFocusId(fallback?.id ?? null);
        window.history.replaceState(null, "", fallback ? `?s=${fallback.id}` : window.location.pathname);
      }
      setTreeMessage(`${KIND_META[c.kind].noun} "${c.title}" ${KIND_META[c.kind].deleted}`);
      setConfirmingDelete(null);
    } catch (err) {
      setConfirmingDelete((prev) =>
        prev ? { ...prev, busy: false, error: err instanceof Error ? err.message : "No se pudo borrar" } : prev,
      );
    }
  }

  // Mini-asistente de 4 pasos para frameworks sin contenido (VS-032 contrato
  // 6): 1. Dimensión → 2. Indicador (opcional, "Saltar") → 3. Subindicador →
  // 4. Primer elemento. Usa los mismos forms inline del árbol; avanza solo.
  function FrameworkWizard() {
    if (!dims || !wizardSession) return null;
    const firstDim = dims[0] ?? null;
    const firstIndicator = firstDim?.indicators[0] ?? null;
    const firstSub = flat[0] ?? null;
    const finalStep = wizardStep >= 3;

    const WIZARD = [
      {
        title: "Dimensión",
        text: "Agrupá sus preguntas por área temática, ej. “Ambiental”, “Social” o “Gobernanza”. Es el nivel más alto de la estructura.",
        optional: false,
      },
      {
        title: "Indicador",
        text: "Opcional: agrupa preguntas dentro de una dimensión, ej. “Emisiones”. ¿No lo necesitás? Saltalo.",
        optional: true,
      },
      {
        title: "Subindicador",
        text: "Un subindicador es un formulario de preguntas, ej. “Huella de carbono total”.",
        optional: false,
      },
    ];

    return (
      <div className="runtime-content">
        <h1>Editor</h1>
        <div className="builder-wizard">
          <h2 className="builder-wizard__title">Creá tu formulario en 4 pasos</h2>
          <ol className="builder-wizard__steps">
            {WIZARD.map((w, i) => {
              const done = wizardStep > i;
              const active = wizardStep === i;
              return (
                <li
                  key={w.title}
                  className={`builder-wizard__step${done ? " builder-wizard__step--done" : ""}${active ? " builder-wizard__step--active" : ""}`}
                >
                  <span className="builder-wizard__badge">{done ? "✓" : i + 1}</span>
                  <span>
                    <strong>{w.title}</strong>
                    {w.optional && <span className="builder-wizard__note"> opcional</span>}
                    {done && <span className="builder-wizard__note"> — listo</span>}
                  </span>
                </li>
              );
            })}
            <li className={`builder-wizard__step${finalStep ? " builder-wizard__step--active" : ""}`}>
              <span className="builder-wizard__badge">{finalStep ? "✓" : 4}</span>
              <strong>Primer elemento</strong>
              {!finalStep && <span className="builder-wizard__note"> pendiente</span>}
            </li>
          </ol>

          <div className="builder-wizard__panel">
            {wizardStep === 0 && (
              <>
                <p className="empty">{WIZARD[0]!.text}</p>
                <div className="runtime-topbar__actions">
                  <Button type="button" variant="primary" size="sm" onClick={() => openCreate({ kind: "dimension" })}>
                    Crear dimensión
                  </Button>
                </div>
              </>
            )}
            {wizardStep === 1 && firstDim && (
              <>
                <p className="empty">{WIZARD[1]!.text}</p>
                <div className="runtime-topbar__actions">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => openCreate({ kind: "indicator", dimensionId: firstDim.dimension.id })}
                  >
                    Crear indicador
                  </Button>
                  <Button type="button" size="sm" onClick={() => setWizardStep(2)}>
                    Saltar
                  </Button>
                </div>
              </>
            )}
            {wizardStep === 2 && firstDim && (
              <>
                <p className="empty">{WIZARD[2]!.text}</p>
                <div className="runtime-topbar__actions">
                  {firstIndicator ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => openCreate({ kind: "sub", indicatorId: firstIndicator.indicator.id })}
                    >
                      Crear subindicador
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => openCreate({ kind: "directSub", dimensionId: firstDim.dimension.id })}
                    >
                      Crear subindicador directo
                    </Button>
                  )}
                </div>
              </>
            )}
            {finalStep && (
              <>
                <p className="empty">
                  {firstSub ? (
                    <>
                      Tu primer formulario <strong>{firstSub.title}</strong> está listo. Agregá sus preguntas con las
                      plantillas <strong>Texto</strong>, <strong>Número</strong>, <strong>Elección</strong> o{" "}
                      <strong>Tabla</strong> del editor.
                    </>
                  ) : (
                    "Estructura creada. Elegí un subindicador en el árbol para empezar a editar."
                  )}
                </p>
                <div className="runtime-topbar__actions">
                  {firstSub && (
                    <Button type="button" variant="primary" size="sm" onClick={() => selectSub(firstSub.id)}>
                      Empezar a editar
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Estado central cuando la selección no es un subindicador editable: si el
  // foco (?s=) apunta a una dimensión/indicador vacío, ofrece el alta directa
  // (mismos forms inline del árbol).
  function EmptyState() {
    if (!dims) return null;
    // Asistente activo mientras el framework recién creado no supera la
    // primera dimensión y todavía nadie eligió "Empezar a editar".
    if (wizardSession && dims.length <= 1) return <FrameworkWizard />;
    // El foco puede venir de la URL (?s=dim/ind vacío → resolveFocus devolvió
    // null y selectedId quedó sin selección).
    const focus = selectedId ?? focusId;
    const targetDim = dims.find((d) => d.dimension.id === focus) ?? null;
    const targetInd = dims.flatMap((d) => d.indicators).find((i) => i.indicator.id === focus) ?? null;

    if (targetDim && focus === targetDim.dimension.id) {
      return (
        <div className="runtime-content">
          <h1>{targetDim.dimension.title}</h1>
          <p className="empty">
            Esta dimensión todavía no tiene indicadores ni subindicadores. Creá un indicador (o uno directo) para
            empezar.
          </p>
          <div className="runtime-topbar__actions">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => openCreate({ kind: "indicator", dimensionId: targetDim.dimension.id })}
            >
              Crear indicador
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => openCreate({ kind: "directSub", dimensionId: targetDim.dimension.id })}
            >
              Crear subindicador directo
            </Button>
          </div>
        </div>
      );
    }

    if (targetInd) {
      return (
        <div className="runtime-content">
          <h1>{targetInd.indicator.title}</h1>
          <p className="empty">Este indicador todavía no tiene subindicadores. Creá el primero para empezar a editar.</p>
          <div className="runtime-topbar__actions">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => openCreate({ kind: "sub", indicatorId: targetInd.indicator.id })}
            >
              Crear subindicador
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="runtime-content">
        <h1>Editor</h1>
        <p className="empty">Seleccioná un subindicador en el árbol para editar su formulario.</p>
      </div>
    );
  }

  const activeSub = activeIndex >= 0 ? flat[activeIndex]! : null;

  return (
    <main className="page page--wide">
      <Breadcrumb
        items={[
          { label: "Frameworks", href: "/frameworks" },
          { label: "Framework", href: `/frameworks/${frameworkId}` },
          { label: "Editor" },
        ]}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {treeMessage}
      </span>

      {!framework || dims === null ? (
        <div className="loading">{treeMessage ? `No se pudo cargar: ${treeMessage}` : "Cargando..."}</div>
      ) : (
        <div className="builder-layout">
          {treeOpen && (
            <button
              type="button"
              className="builder-backdrop"
              aria-label="Cerrar árbol"
              onClick={() => setTreeOpen(false)}
            />
          )}

          <nav id="structure" className={`builder-nav${treeOpen ? " builder-nav--open" : ""}`} aria-label="Estructura">
            <div className="builder-nav__head">
              <strong>{framework.name}</strong>
              <div className="builder-nav__head-row">
                <Pill>{flat.length} subindicadores</Pill>
                <button
                  type="button"
                  className="builder-nav__action builder-nav__action--always"
                  aria-label="Crear dimensión"
                  onClick={() => openCreate({ kind: "dimension" })}
                >
                  ＋
                </button>
              </div>
              <input
                type="search"
                className="builder-nav__search"
                placeholder="Buscar…"
                aria-label="Buscar en la estructura"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {creating?.kind === "dimension" && (
              <form className="builder-nav__form" onSubmit={submitCreate}>
                <label className="field__label" htmlFor="builder-title-dimension">
                  Título del dimensión
                </label>
                <input
                  id="builder-title-dimension"
                  autoFocus
                  value={creating.title}
                  disabled={creating.busy}
                  onChange={(e) => setCreating({ ...creating, title: e.target.value, error: null })}
                  placeholder="Nueva dimensión"
                  required
                />
                {creating.error && (
                  <p className="alert" role="alert">
                    {creating.error}
                  </p>
                )}
                <div className="runtime-topbar__actions">
                  <Button type="submit" variant="primary" size="sm" disabled={creating.busy}>
                    {creating.busy ? "Creando..." : "Crear"}
                  </Button>
                  <Button type="button" size="sm" onClick={closeCreate}>
                    Cancelar
                  </Button>
                </div>
              </form>
            )}

            {searchResults ? (
              <div className="builder-nav__results" role="group" aria-label="Resultados de búsqueda">
                <p className="builder-nav__empty">
                  {searchResults.length === 0
                    ? "Sin resultados."
                    : `${searchResults.length} ${searchResults.length === 1 ? "resultado" : "resultados"}.`}
                </p>
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="runtime-nav__sub"
                    onClick={() => pickSearchResult(r)}
                  >
                    <span aria-hidden="true">{r.kind === "sub" ? "●" : r.kind === "indicator" ? "▸" : "▾"}</span>
                    <span className="builder-nav__label">{r.title}</span>
                    <span className="builder-nav__result-path">{r.path}</span>
                  </button>
                ))}
              </div>
            ) : (
              <>
                {dims.length === 0 && !creating && (
                  <p className="builder-nav__empty">Todavía no hay dimensiones. Creá la primera con ＋.</p>
                )}

            {dims.map((d, di) => {
              const dimOpen = !collapsedDims.has(di);
              const creatingInd =
                creating?.kind === "indicator" && creating.dimensionId === d.dimension.id ? creating : null;
              const creatingDirectSub =
                creating?.kind === "directSub" && creating.dimensionId === d.dimension.id ? creating : null;
              const renamingDim =
                renaming?.kind === "dimension" && renaming.id === d.dimension.id ? renaming : null;
              const confirmingDim =
                confirmingDelete?.kind === "dimension" && confirmingDelete.id === d.dimension.id
                  ? confirmingDelete
                  : null;
              return (
                <div key={d.dimension.id}>
                  <div className="builder-nav__row">
                    <button
                      type="button"
                      className="runtime-nav__toggle"
                      aria-expanded={dimOpen}
                      onClick={() => toggleDim(di)}
                    >
                      <span aria-hidden="true">{dimOpen ? "▾" : "▸"}</span>
                      <span className="builder-nav__label">{d.dimension.title}</span>
                    </button>
                    <span className="builder-nav__actions">
                      <button
                        type="button"
                        className="builder-nav__action"
                        aria-label={`Crear indicador en ${d.dimension.title}`}
                        onClick={() => openCreate({ kind: "indicator", dimensionId: d.dimension.id })}
                      >
                        ＋
                      </button>
                      <button
                        type="button"
                        className="builder-nav__action"
                        aria-label={`Renombrar dimensión ${d.dimension.title}`}
                        onClick={() => startRename("dimension", d.dimension.id, d.dimension.title)}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="builder-nav__action builder-nav__action--danger"
                        aria-label={`Borrar dimensión ${d.dimension.title}`}
                        onClick={() => requestDelete("dimension", d.dimension.id, d.dimension.title)}
                      >
                        🗑
                      </button>
                    </span>
                  </div>

                  {renamingDim && (
                    <form className="builder-nav__form" onSubmit={submitRename}>
                      <label className="field__label" htmlFor="builder-rename-dimension">
                        Renombrar dimensión
                      </label>
                      <input
                        id="builder-rename-dimension"
                        autoFocus
                        value={renamingDim.title}
                        disabled={renamingDim.busy}
                        onChange={(e) => setRenaming({ ...renamingDim, title: e.target.value, error: null })}
                        required
                      />
                      {renamingDim.error && (
                        <p className="alert" role="alert">
                          {renamingDim.error}
                        </p>
                      )}
                      <div className="runtime-topbar__actions">
                        <Button type="submit" variant="primary" size="sm" disabled={renamingDim.busy}>
                          {renamingDim.busy ? "Guardando..." : "Guardar"}
                        </Button>
                        <Button type="button" size="sm" onClick={closeRename}>
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  )}

                  {confirmingDim && (
                    <form className="builder-nav__confirm" onSubmit={submitDelete}>
                      <p>
                        Borrar la dimensión <strong>{confirmingDim.title}</strong> y todo su contenido?
                      </p>
                      {confirmingDim.error && (
                        <p className="alert" role="alert">
                          {confirmingDim.error}
                        </p>
                      )}
                      <div className="runtime-topbar__actions">
                        <Button type="submit" variant="danger" size="sm" disabled={confirmingDim.busy}>
                          {confirmingDim.busy ? "Borrando..." : "Borrar"}
                        </Button>
                        <Button type="button" size="sm" onClick={cancelDelete}>
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  )}

                  {creatingInd && (
                    <form className="builder-nav__form" onSubmit={submitCreate}>
                      <label className="field__label" htmlFor="builder-title-indicator">
                        Título del indicador
                      </label>
                      <input
                        id="builder-title-indicator"
                        autoFocus
                        value={creatingInd.title}
                        disabled={creatingInd.busy}
                        onChange={(e) => setCreating({ ...creatingInd, title: e.target.value, error: null })}
                        placeholder="Nuevo indicador"
                        required
                      />
                      {creatingInd.error && (
                        <p className="alert" role="alert">
                          {creatingInd.error}
                        </p>
                      )}
                      <div className="runtime-topbar__actions">
                        <Button type="submit" variant="primary" size="sm" disabled={creatingInd.busy}>
                          {creatingInd.busy ? "Creando..." : "Crear"}
                        </Button>
                        <Button type="button" size="sm" onClick={closeCreate}>
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  )}

                  {creatingDirectSub && (
                    <form className="builder-nav__form" onSubmit={submitCreate}>
                      <label className="field__label" htmlFor="builder-title-directsub">
                        Título del subindicador
                      </label>
                      <input
                        id="builder-title-directsub"
                        autoFocus
                        value={creatingDirectSub.title}
                        disabled={creatingDirectSub.busy}
                        onChange={(e) =>
                          setCreating({ ...creatingDirectSub, title: e.target.value, error: null })
                        }
                        placeholder="Nuevo subindicador directo"
                        required
                      />
                      {creatingDirectSub.error && (
                        <p className="alert" role="alert">
                          {creatingDirectSub.error}
                        </p>
                      )}
                      <div className="runtime-topbar__actions">
                        <Button type="submit" variant="primary" size="sm" disabled={creatingDirectSub.busy}>
                          {creatingDirectSub.busy ? "Creando..." : "Crear"}
                        </Button>
                        <Button type="button" size="sm" onClick={closeCreate}>
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  )}

                  {dimOpen && (
                    <div role="group" aria-label={`Indicadores de ${d.dimension.title}`}>
                      {d.indicators.map((ind, ii) => {
                        const indOpen = !collapsedInds.has(`${di}:${ii}`);
                        const creatingSub =
                          creating?.kind === "sub" && creating.indicatorId === ind.indicator.id ? creating : null;
                        const renamingInd =
                          renaming?.kind === "indicator" && renaming.id === ind.indicator.id ? renaming : null;
                        const confirmingInd =
                          confirmingDelete?.kind === "indicator" && confirmingDelete.id === ind.indicator.id
                            ? confirmingDelete
                            : null;
                        return (
                          <div key={ind.indicator.id}>
                            <div className="builder-nav__row">
                              <button
                                type="button"
                                className="runtime-nav__toggle"
                                aria-expanded={indOpen}
                                onClick={() => toggleInd(di, ii)}
                              >
                                <span aria-hidden="true">{indOpen ? "▾" : "▸"}</span>
                                <span className="builder-nav__label">{ind.indicator.title}</span>
                              </button>
                              <span className="builder-nav__actions">
                                <button
                                  type="button"
                                  className="builder-nav__action"
                                  aria-label={`Crear subindicador en ${ind.indicator.title}`}
                                  onClick={() => openCreate({ kind: "sub", indicatorId: ind.indicator.id })}
                                >
                                  ＋
                                </button>
                                <button
                                  type="button"
                                  className="builder-nav__action"
                                  aria-label={`Renombrar indicador ${ind.indicator.title}`}
                                  onClick={() => startRename("indicator", ind.indicator.id, ind.indicator.title)}
                                >
                                  ✎
                                </button>
                                <button
                                  type="button"
                                  className="builder-nav__action builder-nav__action--danger"
                                  aria-label={`Borrar indicador ${ind.indicator.title}`}
                                  onClick={() => requestDelete("indicator", ind.indicator.id, ind.indicator.title)}
                                >
                                  🗑
                                </button>
                              </span>
                            </div>

                            {renamingInd && (
                              <form className="builder-nav__form" onSubmit={submitRename}>
                                <label className="field__label" htmlFor="builder-rename-indicator">
                                  Renombrar indicador
                                </label>
                                <input
                                  id="builder-rename-indicator"
                                  autoFocus
                                  value={renamingInd.title}
                                  disabled={renamingInd.busy}
                                  onChange={(e) => setRenaming({ ...renamingInd, title: e.target.value, error: null })}
                                  required
                                />
                                {renamingInd.error && (
                                  <p className="alert" role="alert">
                                    {renamingInd.error}
                                  </p>
                                )}
                                <div className="runtime-topbar__actions">
                                  <Button type="submit" variant="primary" size="sm" disabled={renamingInd.busy}>
                                    {renamingInd.busy ? "Guardando..." : "Guardar"}
                                  </Button>
                                  <Button type="button" size="sm" onClick={closeRename}>
                                    Cancelar
                                  </Button>
                                </div>
                              </form>
                            )}

                            {confirmingInd && (
                              <form className="builder-nav__confirm" onSubmit={submitDelete}>
                                <p>
                                  Borrar el indicador <strong>{confirmingInd.title}</strong> y sus subindicadores?
                                </p>
                                {confirmingInd.error && (
                                  <p className="alert" role="alert">
                                    {confirmingInd.error}
                                  </p>
                                )}
                                <div className="runtime-topbar__actions">
                                  <Button type="submit" variant="danger" size="sm" disabled={confirmingInd.busy}>
                                    {confirmingInd.busy ? "Borrando..." : "Borrar"}
                                  </Button>
                                  <Button type="button" size="sm" onClick={cancelDelete}>
                                    Cancelar
                                  </Button>
                                </div>
                              </form>
                            )}

                            {creatingSub && (
                              <form className="builder-nav__form" onSubmit={submitCreate}>
                                <label className="field__label" htmlFor="builder-title-sub">
                                  Título del subindicador
                                </label>
                                <input
                                  id="builder-title-sub"
                                  autoFocus
                                  value={creatingSub.title}
                                  disabled={creatingSub.busy}
                                  onChange={(e) => setCreating({ ...creatingSub, title: e.target.value, error: null })}
                                  placeholder="Nuevo subindicador"
                                  required
                                />
                                {creatingSub.error && (
                                  <p className="alert" role="alert">
                                    {creatingSub.error}
                                  </p>
                                )}
                                <div className="runtime-topbar__actions">
                                  <Button type="submit" variant="primary" size="sm" disabled={creatingSub.busy}>
                                    {creatingSub.busy ? "Creando..." : "Crear"}
                                  </Button>
                                  <Button type="button" size="sm" onClick={closeCreate}>
                                    Cancelar
                                  </Button>
                                </div>
                              </form>
                            )}

                            {indOpen && (
                              <div role="group" aria-label={`Subindicadores de ${ind.indicator.title}`}>
                                {ind.subs.map((s) => {
                                  const renamingSub = renaming?.kind === "sub" && renaming.id === s.id ? renaming : null;
                                  const confirmingSub =
                                    confirmingDelete?.kind === "sub" && confirmingDelete.id === s.id
                                      ? confirmingDelete
                                      : null;
                                  const isActive = selectedId === s.id;
                                  return (
                                    <div key={s.id}>
                                      <div
                                        className={`builder-nav__row builder-nav__row--sub${isActive ? " runtime-nav__sub--active" : ""}`}
                                      >
                                        <button
                                          type="button"
                                          className="runtime-nav__sub"
                                          aria-current={isActive ? "true" : undefined}
                                          onClick={() => selectSub(s.id)}
                                        >
                                          <span aria-hidden="true">●</span>
                                          <span className="builder-nav__label">{s.title}</span>
                                        </button>
                                        <span className="builder-nav__actions">
                                          <button
                                            type="button"
                                            className="builder-nav__action"
                                            aria-label={`Renombrar subindicador ${s.title}`}
                                            onClick={() => startRename("sub", s.id, s.title)}
                                          >
                                            ✎
                                          </button>
                                          <button
                                            type="button"
                                            className="builder-nav__action builder-nav__action--danger"
                                            aria-label={`Borrar subindicador ${s.title}`}
                                            onClick={() => requestDelete("sub", s.id, s.title)}
                                          >
                                            🗑
                                          </button>
                                        </span>
                                      </div>

                                      {renamingSub && (
                                        <form className="builder-nav__form" onSubmit={submitRename}>
                                          <label className="field__label" htmlFor="builder-rename-sub">
                                            Renombrar subindicador
                                          </label>
                                          <input
                                            id="builder-rename-sub"
                                            autoFocus
                                            value={renamingSub.title}
                                            disabled={renamingSub.busy}
                                            onChange={(e) =>
                                              setRenaming({ ...renamingSub, title: e.target.value, error: null })
                                            }
                                            required
                                          />
                                          {renamingSub.error && (
                                            <p className="alert" role="alert">
                                              {renamingSub.error}
                                            </p>
                                          )}
                                          <div className="runtime-topbar__actions">
                                            <Button type="submit" variant="primary" size="sm" disabled={renamingSub.busy}>
                                              {renamingSub.busy ? "Guardando..." : "Guardar"}
                                            </Button>
                                            <Button type="button" size="sm" onClick={closeRename}>
                                              Cancelar
                                            </Button>
                                          </div>
                                        </form>
                                      )}

                                      {confirmingSub && (
                                        <form className="builder-nav__confirm" onSubmit={submitDelete}>
                                          <p>
                                            Borrar el subindicador <strong>{confirmingSub.title}</strong>?
                                          </p>
                                          {confirmingSub.error && (
                                            <p className="alert" role="alert">
                                              {confirmingSub.error}
                                            </p>
                                          )}
                                          <div className="runtime-topbar__actions">
                                            <Button type="submit" variant="danger" size="sm" disabled={confirmingSub.busy}>
                                              {confirmingSub.busy ? "Borrando..." : "Borrar"}
                                            </Button>
                                            <Button type="button" size="sm" onClick={cancelDelete}>
                                              Cancelar
                                            </Button>
                                          </div>
                                        </form>
                                      )}
                                    </div>
                                  );
                                })}
                                {d.directSubs.map((s) => {
                                  const isActive = selectedId === s.id;
                                  return (
                                    <div
                                      className={`builder-nav__row builder-nav__row--sub${isActive ? " runtime-nav__sub--active" : ""}`}
                                      key={s.id}
                                    >
                                      <button
                                        type="button"
                                        className="runtime-nav__sub"
                                        aria-current={isActive ? "true" : undefined}
                                        onClick={() => selectSub(s.id)}
                                      >
                                        <span aria-hidden="true">●</span>
                                        <span className="builder-nav__label">{s.title}</span>
                                      </button>
                                      <span className="builder-nav__actions">
                                        <button
                                          type="button"
                                          className="builder-nav__action"
                                          aria-label={`Renombrar subindicador ${s.title}`}
                                          onClick={() => startRename("sub", s.id, s.title)}
                                        >
                                          ✎
                                        </button>
                                        <button
                                          type="button"
                                          className="builder-nav__action builder-nav__action--danger"
                                          aria-label={`Borrar subindicador ${s.title}`}
                                          onClick={() => requestDelete("sub", s.id, s.title)}
                                        >
                                          🗑
                                        </button>
                                      </span>
                                    </div>
                                  );
                                })}
                                {ind.subs.length === 0 && d.directSubs.length === 0 && (
                                  <p className="builder-nav__empty">
                                    Sin subindicadores todavía — usá ＋ en el indicador.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {d.indicators.length === 0 && d.directSubs.length === 0 && (
                        <p className="builder-nav__empty">Sin indicadores todavía — usá ＋ en la dimensión.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
              </>
            )}
          </nav>

          <section className="builder-panel" aria-label="Panel de edición">
            <button type="button" className="builder-nav-toggle" onClick={() => setTreeOpen(true)}>
              🌳 Estructura
            </button>
            {activeSub ? (
              <SubindicatorEditor key={activeSub.id} subindicatorId={activeSub.id} />
            ) : (
              <EmptyState />
            )}
          </section>
        </div>
      )}
    </main>
  );
}