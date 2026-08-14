// scripts/csa-2026-replica-data.ts
// ============================================================================
// Réplica de prueba del árbol CSA 2026 — generador standalone SIN imports
// externos. Produce `replicaData: DimensionData[]` con 6 dimensiones / 28
// indicadores / 161 subindicadores, cada subindicador con un `formSchema`
// de 2-5 elementos que rota entre todos los tipos de elemento soportados
// salvo `calculado`.
//
// Estructura replicada del portal S&P Global CSA 2026 (públicamente
// documentada en docs/analysis/csa-sp-global-comparison.md:66-69 y el plan
// D:\Usuarios\PM75161698\.claude\plans\luminous-moseying-narwhal.md, Parte 2):
//   0 Company Information          → subindicadores directos bajo dimensión (VS-029)
//   1 Governance & Economic Dimension → 11 indicadores
//   2 Environmental Dimension     → 9 indicadores
//   3 Social Dimension            → 7 indicadores
//   4 Future Questions (Optional) → 1 indicador
//   5 Feedback Survey             → subindicadores directos bajo dimensión (VS-029)
//
// Títulos de subindicadores y labels de elementos son sintéticos y
// representativos (no contenido propietario de preguntas reales del CSA),
// generados programáticamente con loops + word banks y un PRNG con seed
// determinista (mulberry32). El contrato de tipos es espejo del zod de
// packages/sdk-core/src/form-schema.ts (FormSchema/FormElement) — el script
// de escritura (Parte 2) valida con formSchema.parse() antes de persistir.
// ============================================================================

// --- Tipos (espejo del contrato zod de packages/sdk-core/src/form-schema.ts) --

export interface SubSubOption {
  id: string;
  label: string;
}

export interface SubOption {
  id: string;
  label: string;
  subOptions?: SubSubOption[];
}

export interface FormOption {
  id: string;
  label: string;
  subOptions?: SubOption[];
}

export interface VisibleIfCondition {
  elementId: string;
  operator: "equals" | "notEquals" | "contains" | "isAnswered" | "isEmpty";
  value?: string | number;
}

interface FormElementBaseData {
  id: string;
  componentVersion?: number;
  visibleIf?: VisibleIfCondition;
}

interface QuestionElementBaseData extends FormElementBaseData {
  label: string;
  helpText?: string;
  required?: boolean;
}

export interface TextoCortoElementData extends QuestionElementBaseData {
  type: "texto_corto";
  maxLength?: number;
}

export interface TextoLargoElementData extends QuestionElementBaseData {
  type: "texto_largo";
  maxLength?: number;
}

export interface NumeroElementData extends QuestionElementBaseData {
  type: "numero";
  min?: number;
  max?: number;
  unit?: string;
  availableUnits?: string[];
}

export interface SeleccionUnicaElementData extends QuestionElementBaseData {
  type: "seleccion_unica";
  options: FormOption[];
}

export interface SeleccionMultipleElementData extends QuestionElementBaseData {
  type: "seleccion_multiple";
  options: FormOption[];
  minSelected?: number;
  maxSelected?: number;
}

export interface SeleccionDesplegableElementData extends QuestionElementBaseData {
  type: "seleccion_desplegable";
  options: FormOption[];
}

export interface InstruccionElementData extends FormElementBaseData {
  type: "instruccion";
  label: string;
}

export interface BannerElementData extends FormElementBaseData {
  type: "banner";
  label: string;
  content: string;
  variant: "info" | "warning";
  startCollapsed?: boolean;
}

export interface EvidenciaElementData extends QuestionElementBaseData {
  type: "evidencia";
  maxFiles?: number;
  maxSizeMb?: number;
  acceptedTypes?: string[];
}

export interface UrlPublicaElementData extends QuestionElementBaseData {
  type: "url_publica";
  maxUrls?: number;
}

export interface FormTableColumnData {
  id: string;
  label: string;
}

export type FormTableCellType = "texto" | "numero" | "seleccion_desplegable";

export interface FormTableRowData {
  id: string;
  label: string;
  cellType: FormTableCellType;
  unit?: string;
  availableUnits?: string[];
  options?: FormOption[];
  maxLength?: number;
}

export interface TablaDatosElementData extends QuestionElementBaseData {
  type: "tabla_datos";
  columns: FormTableColumnData[];
  rows: FormTableRowData[];
}

export type FormElementData =
  | TextoCortoElementData
  | TextoLargoElementData
  | NumeroElementData
  | SeleccionUnicaElementData
  | SeleccionMultipleElementData
  | SeleccionDesplegableElementData
  | InstruccionElementData
  | BannerElementData
  | EvidenciaElementData
  | UrlPublicaElementData
  | TablaDatosElementData;

export interface FormSchemaData {
  schemaVersion: 1;
  elements: FormElementData[];
}

export interface SubindicatorData {
  id: string;
  title: string;
  description: string;
  indicatorId?: string;
  dimensionId?: string;
  formSchema: FormSchemaData;
}

export interface IndicatorData {
  id: string;
  title: string;
  description: string;
  subindicators: SubindicatorData[];
}

export interface DimensionData {
  id: string;
  title: string;
  description: string;
  indicators: IndicatorData[];
  subindicators?: SubindicatorData[];
}

// --- PRNG determinista (mulberry32) ----------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(n: number): number {
  return ((n + 1) * 2654435761) >>> 0;
}

function pick<T>(rand: () => number, bank: readonly T[]): T {
  if (bank.length === 0) throw new Error("pick() called on empty bank");
  const value = bank[Math.floor(rand() * bank.length)];
  if (value === undefined) throw new Error("pick() returned undefined");
  return value;
}

// --- Word banks -------------------------------------------------------------

const DETAILS = [
  "Management Approach",
  "Reporting Boundaries",
  "Disclosure & Transparency",
  "Data & Metrics",
  "Performance Assessment",
  "Targets & Commitments",
  "Governance & Oversight",
  "Verification & Assurance",
  "Policies & Practices",
  "Risk & Opportunity Assessment",
  "Stakeholder Engagement",
  "Trend Analysis",
  "Scope & Methodology",
  "Implementation Status",
  "Outcome & Impact",
  "Material Topics",
];

const COMPANY_DETAILS = [
  "Denominator — Revenues",
  "Company Profile",
  "Workforce Overview",
  "Organizational Structure",
  "Segment Breakdown",
];

const FEEDBACK_DETAILS = [
  "Feedback on the Questionnaire",
  "Feedback on the Assessment Process",
  "Suggestions and General Comments",
];

const QUALIFIERS = [
  "Group-level",
  "Consolidated",
  "Operational",
  "Value chain",
  "Reporting year",
  "Three-year outlook",
  "Scope 1 & 2",
  "All material entities",
  "Direct operations",
  "Publicly available",
];

const GOVERNANCE_INDICATORS = [
  "Transparency & Reporting",
  "Corporate Governance",
  "Risk & Crisis Management",
  "Business Ethics & Anti-Corruption",
  "Tax Strategy",
  "Policy Influence & Lobbying",
  "Supply Chain Management",
  "Cyber Security",
  "Innovation Management",
  "Anti-Competitive Practices",
  "Stakeholder Engagement & Materiality",
];

const ENVIRONMENTAL_INDICATORS = [
  "Environmental Strategy & Management",
  "Climate Strategy & GHG Targets",
  "Direct GHG Emissions (Scope 1)",
  "Indirect GHG Emissions (Scope 2)",
  "Energy Consumption & Mix",
  "Water Management",
  "Waste & Circularity",
  "Biodiversity & Land Use",
  "Materials & Resource Efficiency",
];

const SOCIAL_INDICATORS = [
  "Labor Practices & Indicators",
  "Human Rights",
  "Diversity & Inclusion",
  "Occupational Health & Safety",
  "Talent Attraction & Retention",
  "Community & Society",
  "Customer & Product Responsibility",
];

const FUTURE_INDICATORS = ["Future Preparedness & Climate Transition"];

const VERBS = [
  "Describe",
  "Disclose",
  "Assess",
  "Indicate",
  "Confirm",
  "Specify",
  "Report",
  "Explain",
  "Quantify",
  "Detail",
];

const TOPICS = [
  "Sustainability Reporting",
  "Corporate Governance",
  "Climate Strategy",
  "GHG Emissions",
  "Energy Consumption",
  "Water Management",
  "Waste Management",
  "Biodiversity",
  "Human Rights",
  "Labor Practices",
  "Diversity & Inclusion",
  "Health & Safety",
  "Supply Chain",
  "Customer Engagement",
  "Data Privacy",
  "Tax Transparency",
  "Executive Compensation",
  "Risk Management",
  "Stakeholder Engagement",
  "Innovation",
  "Product Quality",
  "Community Investment",
  "Anti-Corruption",
  "Cyber Security",
  "Employee Training",
  "Talent Retention",
  "Board Composition",
  "Materiality Assessment",
  "Scenario Analysis",
  "Circular Economy",
];

const SUFFIXES = [
  "for the reporting period",
  "across the value chain",
  "at group level",
  "in direct operations",
  "over the past three years",
  "implemented in 2025",
  "against public targets",
  "at the consolidated level",
  "covering all material entities",
  "with third-party assurance",
];

const HELP_BANK = [
  "Provide context and reference publicly available documents.",
  "Include quantitative data where available.",
  "Explain any differences from the prior reporting period.",
  "Reference the relevant policy or regulation.",
  "Specify the scope and methodology applied.",
  "Describe the process and the parties responsible.",
  "Indicate the level of assurance obtained, if any.",
];

const INSTRUCTION_BANK = [
  "Please answer all applicable questions.",
  "Where data is not available, indicate so explicitly.",
  "Review the information before saving.",
  "All fields marked with * are required.",
  "Use the evidence fields to support your responses.",
];

const DESCRIPTION_BANK = [
  "Describe the company's approach and provide supporting evidence where available.",
  "Provide quantitative data and explain year-on-year changes.",
  "Indicate the status and explain the reason for any differences.",
  "Detail the policies, responsibilities and oversight for this topic.",
  "Report progress against the stated targets and timelines.",
  "Describe the scope and methodology applied, including assumptions.",
  "Provide context and reference publicly available documents.",
  "Assess current performance and outline planned actions.",
];

const OPTION_LABELS = [
  "Yes",
  "No",
  "Partially",
  "Not applicable",
  "Fully implemented",
  "Partially implemented",
  "Not implemented",
  "Planned for 2026",
  "Group-wide",
  "Operational control",
  "Equity share",
  "Financial control",
  "Annually",
  "Biennially",
  "Quarterly",
  "Ad hoc",
  "Increase",
  "Decrease",
  "Stable",
  "Not measured",
  "Third-party verified",
  "Internal review",
  "Not verified",
  "Public report",
  "Website",
  "Regulatory filing",
  "Internal only",
];

const OPTION_DETAILS = [
  "for all material entities",
  "with third-party assurance",
  "for the reporting year",
  "including acquisitions",
  "excluding joint ventures",
  "at the consolidated level",
];

const SUB_OPTION_LABELS = [
  "Include subsidiaries",
  "Exclude joint ventures",
  "Exclude acquisitions in the reporting year",
  "Include non-operated assets",
  "Reported to the Board",
  "Approved by management",
  "Covered in the annual report",
  "Covered on the corporate website",
  "Pending final approval",
  "Reviewed by internal audit",
];

const SUBSUB_OPTION_LABELS = [
  "Reported to the Board",
  "Approved by management",
  "Covered in the annual report",
  "Covered on the corporate website",
  "Pending final approval",
  "Reviewed by internal audit",
  "Disclosed in the ESG report",
  "Available on request",
];

const YEARS = ["FY 2022", "FY 2023", "FY 2024", "FY 2025", "Target 2030"];

const GENERIC_COLUMNS = ["Current", "Previous", "Planned", "Target", "Comment"];

const METRIC_ROW_LABELS = [
  "Total Scope 1 emissions",
  "Scope 2 market-based",
  "Coverage %",
  "Total revenue",
  "Energy consumption",
  "Water withdrawal",
  "Waste recycled",
  "Headcount",
  "Total recordable injury rate",
  "Board size",
  "Independent directors",
  "Women in management",
  "Average training hours",
  "Supplier audits",
];

const GENERIC_ROW_LABELS = [
  "Current practice",
  "Previous practice",
  "Planned action",
  "Target value",
  "Comment",
];

const UNITS = [
  "USD",
  "EUR",
  "met. ton. CO2e",
  "tCO2e",
  "MWh",
  "GWh",
  "m³",
  "ML",
  "tonnes",
  "kg",
  "%",
  "FTE",
  "employees",
  "USD thousand",
];

const UNIT_SETS: readonly (readonly string[])[] = [
  ["met. ton. CO2e", "metric tonnes carbon equivalent", "tCO2e"],
  ["MWh", "GWh", "TJ"],
  ["m³", "thousand m³", "ML"],
  ["USD", "EUR", "USD thousand"],
  ["%", "percentage points", "basis points"],
  ["FTE", "employees", "headcount"],
];

// --- Helpers de generación de elementos -------------------------------------

function makeLabel(rand: () => number): string {
  const verb = pick(rand, VERBS);
  const topic = pick(rand, TOPICS);
  const suffix = pick(rand, SUFFIXES);
  if (rand() < 0.5) return `${verb} ${topic} ${suffix}`;
  return `${verb} ${topic} ${suffix}. ${pick(rand, HELP_BANK)}`;
}

function makeHelp(rand: () => number): string {
  return pick(rand, HELP_BANK);
}

function makeOption(rand: () => number, baseId: string, withSubOptions: boolean): FormOption {
  const label = pick(rand, OPTION_LABELS) + (rand() < 0.3 ? ` — ${pick(rand, OPTION_DETAILS)}` : "");
  if (!withSubOptions) return { id: baseId, label };

  const subCount = 1 + Math.floor(rand() * 3);
  const subOptions: SubOption[] = [];
  for (let j = 0; j < subCount; j++) {
    const sub: SubOption = { id: `${baseId}-s${j}`, label: pick(rand, SUB_OPTION_LABELS) };
    if (rand() < 0.5) {
      sub.subOptions = [
        { id: `${baseId}-s${j}-0`, label: pick(rand, SUBSUB_OPTION_LABELS) },
        { id: `${baseId}-s${j}-1`, label: pick(rand, SUBSUB_OPTION_LABELS) },
      ];
    }
    subOptions.push(sub);
  }
  return { id: baseId, label, subOptions };
}

function optionalQuestionFields(rand: () => number): { required?: boolean; helpText?: string } {
  return {
    ...(rand() < 0.5 ? { required: true } : {}),
    ...(rand() < 0.5 ? { helpText: makeHelp(rand) } : {}),
  };
}

function buildTextElement(
  type: "texto_corto" | "texto_largo",
  rand: () => number,
  elId: string,
): TextoCortoElementData | TextoLargoElementData {
  const maxLength = rand() < 0.4 ? (type === "texto_corto" ? 120 : 2000) : undefined;
  const common = {
    id: elId,
    componentVersion: 1,
    label: makeLabel(rand),
    ...(maxLength !== undefined ? { maxLength } : {}),
    ...optionalQuestionFields(rand),
  };
  if (type === "texto_corto") return { ...common, type: "texto_corto" };
  return { ...common, type: "texto_largo" };
}

function pickUnitSet(rand: () => number): readonly string[] {
  return UNIT_SETS[Math.floor(rand() * UNIT_SETS.length)] ?? UNITS;
}

function buildNumero(rand: () => number, elId: string): NumeroElementData {
  const useAvailableUnits = rand() < 0.4;
  const unitSet = pickUnitSet(rand);
  const hasRange = rand() < 0.3;
  return {
    id: elId,
    componentVersion: 1,
    type: "numero",
    label: makeLabel(rand),
    ...(hasRange ? { min: 0, max: 1_000_000 } : {}),
    ...(useAvailableUnits ? { availableUnits: [...unitSet] } : { unit: unitSet[0] ?? "unit" }),
    ...optionalQuestionFields(rand),
  };
}

function buildSelect(
  type: "seleccion_unica" | "seleccion_multiple" | "seleccion_desplegable",
  rand: () => number,
  elId: string,
): SeleccionUnicaElementData | SeleccionMultipleElementData | SeleccionDesplegableElementData {
  const optionCount = 3 + Math.floor(rand() * 4);
  const withSubOptions = rand() < 0.5;
  const options = Array.from({ length: optionCount }, (_, i) =>
    makeOption(rand, `${elId}-o${i}`, withSubOptions && i === 0),
  );
  const label = makeLabel(rand);

  if (type === "seleccion_multiple") {
    const hasBounds = rand() < 0.35;
    const minSelected = hasBounds ? 1 : undefined;
    return {
      id: elId,
      componentVersion: 1,
      type: "seleccion_multiple",
      label,
      options,
      ...(minSelected !== undefined ? { minSelected, maxSelected: options.length } : {}),
      ...optionalQuestionFields(rand),
    };
  }
  if (type === "seleccion_desplegable") {
    return {
      id: elId,
      componentVersion: 1,
      type: "seleccion_desplegable",
      label,
      options,
      ...optionalQuestionFields(rand),
    };
  }
  return {
    id: elId,
    componentVersion: 1,
    type: "seleccion_unica",
    label,
    options,
    ...optionalQuestionFields(rand),
  };
}

function buildInstruccion(rand: () => number, elId: string): InstruccionElementData {
  return {
    id: elId,
    componentVersion: 1,
    type: "instruccion",
    label: pick(rand, INSTRUCTION_BANK),
  };
}

function buildBanner(rand: () => number, elId: string): BannerElementData {
  const variant = rand() < 0.5 ? "info" : "warning";
  return {
    id: elId,
    componentVersion: 1,
    type: "banner",
    variant,
    label: variant === "info" ? "Public information requirement" : "Additional guidance",
    content:
      variant === "info"
        ? "Requirement: This question requires publicly available information."
        : "Additional information and question guidance.",
    ...(rand() < 0.6 ? { startCollapsed: true } : {}),
  };
}

function buildEvidencia(rand: () => number, elId: string): EvidenciaElementData {
  return {
    id: elId,
    componentVersion: 1,
    type: "evidencia",
    label: makeLabel(rand),
    ...(rand() < 0.6 ? { maxFiles: 3 } : {}),
    ...(rand() < 0.5 ? { maxSizeMb: 20 } : {}),
    ...(rand() < 0.5 ? { acceptedTypes: ["pdf", "png", "jpg"] } : {}),
    ...optionalQuestionFields(rand),
  };
}

function buildUrlPublica(rand: () => number, elId: string): UrlPublicaElementData {
  return {
    id: elId,
    componentVersion: 1,
    type: "url_publica",
    label: makeLabel(rand),
    maxUrls: 3,
    ...optionalQuestionFields(rand),
  };
}

function buildTableRow(rand: () => number, rowId: string, numericTable: boolean): FormTableRowData {
  const roll = rand();
  let cellType: FormTableCellType;
  if (numericTable) {
    cellType = roll < 0.75 ? "numero" : roll < 0.9 ? "seleccion_desplegable" : "texto";
  } else {
    cellType = roll < 0.4 ? "texto" : roll < 0.75 ? "numero" : "seleccion_desplegable";
  }

  const row: FormTableRowData = {
    id: rowId,
    label: numericTable ? pick(rand, METRIC_ROW_LABELS) : pick(rand, GENERIC_ROW_LABELS),
    cellType,
  };
  if (cellType === "numero") {
    const unitSet = pickUnitSet(rand);
    if (rand() < 0.5) row.availableUnits = [...unitSet];
    else row.unit = unitSet[0] ?? "unit";
  } else if (cellType === "seleccion_desplegable") {
    row.options = Array.from({ length: 3 + Math.floor(rand() * 2) }, (_, oi) => ({
      id: `${rowId}-o${oi}`,
      label: pick(rand, OPTION_LABELS),
    }));
  } else {
    row.maxLength = rand() < 0.5 ? 200 : 1000;
  }
  return row;
}

function buildTablaDatos(rand: () => number, elId: string): TablaDatosElementData {
  const numericTable = rand() < 0.7;
  const columnCount = 3 + Math.floor(rand() * 3);
  const columns = Array.from({ length: columnCount }, (_, ci) => ({
    id: `${elId}-c${ci}`,
    label: numericTable ? (YEARS[ci % YEARS.length] ?? `Column ${ci + 1}`) : (GENERIC_COLUMNS[ci] ?? `Column ${ci + 1}`),
  }));
  const rowCount = 2 + Math.floor(rand() * 3);
  const rows = Array.from({ length: rowCount }, (_, ri) => buildTableRow(rand, `${elId}-r${ri}`, numericTable));

  return {
    id: elId,
    componentVersion: 1,
    type: "tabla_datos",
    label: numericTable ? "Report the quantitative data in the table below." : makeLabel(rand),
    columns,
    rows,
    ...optionalQuestionFields(rand),
  };
}

// --- Selección de tipo de elemento ------------------------------------------

type ElementTypeName =
  | "texto_corto"
  | "texto_largo"
  | "numero"
  | "seleccion_unica"
  | "seleccion_multiple"
  | "seleccion_desplegable"
  | "instruccion"
  | "banner"
  | "evidencia"
  | "url_publica"
  | "tabla_datos";

interface ElementTypeEntry {
  type: ElementTypeName;
  weight: number;
  isQuestion: boolean;
}

// Todos los tipos soportados salvo `calculado` (el plan Parte 2 lo excluye:
// su valor lo escribe el Runtime, no el evaluado).
const ELEMENT_TYPE_POOL: readonly ElementTypeEntry[] = [
  { type: "seleccion_unica", weight: 20, isQuestion: true },
  { type: "seleccion_multiple", weight: 12, isQuestion: true },
  { type: "numero", weight: 16, isQuestion: true },
  { type: "seleccion_desplegable", weight: 10, isQuestion: true },
  { type: "texto_corto", weight: 8, isQuestion: true },
  { type: "texto_largo", weight: 8, isQuestion: true },
  { type: "url_publica", weight: 7, isQuestion: true },
  { type: "evidencia", weight: 7, isQuestion: true },
  { type: "tabla_datos", weight: 9, isQuestion: true },
  { type: "instruccion", weight: 2, isQuestion: false },
  { type: "banner", weight: 2, isQuestion: false },
];

// Garantiza cobertura de TODOS los tipos (excepto calculado): las primeras
// 11 formas usan cada tipo como primer elemento, en orden.
const ELEMENT_TYPE_ORDER: readonly ElementTypeName[] = [
  "texto_corto",
  "texto_largo",
  "numero",
  "seleccion_unica",
  "seleccion_multiple",
  "seleccion_desplegable",
  "instruccion",
  "banner",
  "evidencia",
  "url_publica",
  "tabla_datos",
];

function pickWeighted(rand: () => number, pool: readonly ElementTypeEntry[]): ElementTypeName {
  const total = pool.reduce((acc, entry) => acc + entry.weight, 0);
  let r = rand() * total;
  for (const entry of pool) {
    r -= entry.weight;
    if (r <= 0) return entry.type;
  }
  const last = pool[pool.length - 1];
  if (!last) throw new Error("empty element type pool");
  return last.type;
}

function pickType(rand: () => number): ElementTypeName {
  return pickWeighted(rand, ELEMENT_TYPE_POOL);
}

function pickQuestionType(rand: () => number): ElementTypeName {
  return pickWeighted(rand, ELEMENT_TYPE_POOL.filter((entry) => entry.isQuestion));
}

function forcedFirstType(globalSeq: number): ElementTypeName | undefined {
  return globalSeq < ELEMENT_TYPE_ORDER.length ? ELEMENT_TYPE_ORDER[globalSeq] : undefined;
}

function getFirstOptionId(el: FormElementData): string | undefined {
  switch (el.type) {
    case "seleccion_unica":
    case "seleccion_multiple":
    case "seleccion_desplegable":
      return el.options[0]?.id;
    default:
      return undefined;
  }
}

function isQuestionType(type: ElementTypeName): boolean {
  return ELEMENT_TYPE_POOL.find((entry) => entry.type === type)?.isQuestion ?? false;
}

// visibleIf (docs/engines/rule.md): condición válida solo si referencia un
// elemento distinto del propio — nunca generamos la autorreferencia que
// rechaza el superRefine del zod. Adicionalmente, la referencia debe ser a
// una PREGUNTA del mismo Subindicador: un `instruccion`/`banner` no captura
// respuesta, y un `isAnswered` contra él ocultaría el elemento para siempre
// (bug 2026-08-11, visto en 2.1.3 de la réplica publicada). Se condiciona
// sobre la última pregunta anterior; sin pregunta previa, siempre visible.
function applyVisibleIf(
  elements: readonly FormElementData[],
  index: number,
  rand: () => number,
  built: FormElementData,
): FormElementData {
  if (index === 0 || rand() >= 0.35) return built;
  const target = [...elements].reverse().find((el) => isQuestionType(el.type));
  if (!target) return built;
  const optionId = getFirstOptionId(target);
  const cond: VisibleIfCondition =
    optionId !== undefined
      ? { elementId: target.id, operator: "equals", value: optionId }
      : { elementId: target.id, operator: "isAnswered" };
  return { ...built, visibleIf: cond };
}

function buildElement(type: ElementTypeName, rand: () => number, elId: string): FormElementData {
  switch (type) {
    case "texto_corto":
      return buildTextElement("texto_corto", rand, elId);
    case "texto_largo":
      return buildTextElement("texto_largo", rand, elId);
    case "numero":
      return buildNumero(rand, elId);
    case "seleccion_unica":
    case "seleccion_multiple":
    case "seleccion_desplegable":
      return buildSelect(type, rand, elId);
    case "instruccion":
      return buildInstruccion(rand, elId);
    case "banner":
      return buildBanner(rand, elId);
    case "evidencia":
      return buildEvidencia(rand, elId);
    case "url_publica":
      return buildUrlPublica(rand, elId);
    case "tabla_datos":
      return buildTablaDatos(rand, elId);
  }
}

// --- Generación de formSchemas ----------------------------------------------

const FORM_SEED_XOR = 0x5bd1e995;

function buildFormSchema(globalSeq: number, forcedFirst: ElementTypeName | undefined): FormSchemaData {
  const rand = mulberry32(hashSeed(globalSeq) ^ FORM_SEED_XOR);
  const elementCount = 2 + Math.floor(rand() * 4); // 2..5 elementos
  const elements: FormElementData[] = [];

  for (let i = 0; i < elementCount; i++) {
    const elId = `el-${globalSeq}-${i}`;
    const type = i === 0 ? (forcedFirst ?? pickQuestionType(rand)) : pickType(rand);
    const built = buildElement(type, rand, elId);
    elements.push(applyVisibleIf(elements, i, rand, built));
  }

  return { schemaVersion: 1, elements };
}

// --- Estructura de dimensiones ----------------------------------------------

interface DimensionSpec {
  title: string;
  indicatorBank: readonly string[];
  detailBank: readonly string[];
  indicatorCount: number;
  subindicatorTotal: number;
  directCount: number;
  distributionSeed: number;
}

// Conteos objetivos del árbol público del CSA 2026 (161 sub-cuestionarios en
// total): 0.x y 5.x cuelgan directo de la dimensión (VS-029).
const DIMENSION_SPECS: readonly DimensionSpec[] = [
  {
    title: "Company Information",
    indicatorBank: [],
    detailBank: COMPANY_DETAILS,
    indicatorCount: 0,
    subindicatorTotal: 0,
    directCount: 4,
    distributionSeed: 7,
  },
  {
    title: "Governance & Economic Dimension",
    indicatorBank: GOVERNANCE_INDICATORS,
    detailBank: DETAILS,
    indicatorCount: 11,
    subindicatorTotal: 88,
    directCount: 0,
    distributionSeed: 101,
  },
  {
    title: "Environmental Dimension",
    indicatorBank: ENVIRONMENTAL_INDICATORS,
    detailBank: DETAILS,
    indicatorCount: 9,
    subindicatorTotal: 36,
    directCount: 0,
    distributionSeed: 202,
  },
  {
    title: "Social Dimension",
    indicatorBank: SOCIAL_INDICATORS,
    detailBank: DETAILS,
    indicatorCount: 7,
    subindicatorTotal: 28,
    directCount: 0,
    distributionSeed: 303,
  },
  {
    title: "Future Questions (Optional)",
    indicatorBank: FUTURE_INDICATORS,
    detailBank: DETAILS,
    indicatorCount: 1,
    subindicatorTotal: 3,
    directCount: 0,
    distributionSeed: 404,
  },
  {
    title: "Feedback Survey",
    indicatorBank: [],
    detailBank: FEEDBACK_DETAILS,
    indicatorCount: 0,
    subindicatorTotal: 0,
    directCount: 2,
    distributionSeed: 505,
  },
];

function distributeCount(total: number, buckets: number, seed: number): number[] {
  const rand = mulberry32(seed);
  const base = Math.floor(total / buckets);
  const counts = Array.from({ length: buckets }, () => {
    const jitter = Math.floor(rand() * 3) - 1; // -1, 0, 1
    return Math.max(1, base + jitter);
  });
  let delta = total - counts.reduce((sum, c) => sum + c, 0);
  let i = 0;
  while (delta !== 0 && i < buckets * 200) {
    const idx = i % buckets;
    const current = counts[idx];
    if (current === undefined) {
      i++;
      continue;
    }
    if (delta > 0) {
      counts[idx] = current + 1;
      delta--;
    } else if (current > 1) {
      counts[idx] = current - 1;
      delta++;
    }
    i++;
  }
  if (delta !== 0) {
    throw new Error(`distributeCount failed to reach total ${total} over ${buckets} buckets`);
  }
  return counts;
}

function makeDimensionDescription(title: string): string {
  return `${title} — Dimension of the CSA 2026 replica framework. Structure based on the publicly documented S&P Global CSA questionnaire tree.`;
}

function makeIndicatorDescription(theme: string): string {
  return `Evaluates ${theme} across the company's operations and value chain for the reporting period.`;
}

// --- Generación del árbol ----------------------------------------------------

let globalSeq = 0;

function buildSubindicator(
  dimIdx: number,
  indIdx: number | null,
  _subIdx: number,
  theme: string,
  spec: DimensionSpec,
): SubindicatorData {
  const rand = mulberry32(hashSeed(globalSeq));
  const detail = pick(rand, spec.detailBank);
  const qualifier = pick(rand, QUALIFIERS);
  const useQualifier = rand() < 0.4;
  const title =
    indIdx === null
      ? detail
      : useQualifier
        ? `${theme} — ${qualifier} ${detail}`
        : `${theme}: ${detail}`;
  const description = pick(rand, DESCRIPTION_BANK);
  const formSchema = buildFormSchema(globalSeq, forcedFirstType(globalSeq));
  const id = `sub-${globalSeq}`;

  globalSeq++;

  return {
    id,
    title,
    description,
    formSchema,
    ...(indIdx !== null ? { indicatorId: `ind-${dimIdx}-${indIdx}` } : { dimensionId: `dim-${dimIdx}` }),
  };
}

const replicaData: DimensionData[] = DIMENSION_SPECS.map((spec, dimIdx) => {
  const direct: SubindicatorData[] = [];
  for (let d = 0; d < spec.directCount; d++) {
    direct.push(buildSubindicator(dimIdx, null, d, spec.title, spec));
  }

  const counts =
    spec.indicatorCount > 0
      ? distributeCount(spec.subindicatorTotal, spec.indicatorCount, spec.distributionSeed)
      : [];

  const indicators: IndicatorData[] = counts.map((count, indIdx) => {
    const theme = spec.indicatorBank[indIdx % spec.indicatorBank.length] ?? `Indicator ${indIdx + 1}`;
    const subindicators: SubindicatorData[] = [];
    for (let s = 0; s < count; s++) {
      subindicators.push(buildSubindicator(dimIdx, indIdx, s, theme, spec));
    }
    return {
      id: `ind-${dimIdx}-${indIdx}`,
      title: theme,
      description: makeIndicatorDescription(theme),
      subindicators,
    };
  });

  return {
    id: `dim-${dimIdx}`,
    title: spec.title,
    description: makeDimensionDescription(spec.title),
    indicators,
    ...(direct.length > 0 ? { subindicators: direct } : {}),
  };
});

// --- Verificación y log al exportar -------------------------------------------

const totalDimensions = replicaData.length;
const totalIndicators = replicaData.reduce((acc, d) => acc + d.indicators.length, 0);
const totalSubindicators = replicaData.reduce(
  (acc, d) =>
    acc +
    d.indicators.reduce((a, ind) => a + ind.subindicators.length, 0) +
    (d.subindicators?.length ?? 0),
  0,
);
const totalElements = replicaData.reduce(
  (acc, d) =>
    acc +
    d.indicators.reduce(
      (a, ind) => a + ind.subindicators.reduce((b, s) => b + s.formSchema.elements.length, 0),
      0,
    ) +
    (d.subindicators?.reduce((b, s) => b + s.formSchema.elements.length, 0) ?? 0),
  0,
);

if (totalSubindicators !== 161) {
  throw new Error(`[csa-2026-replica-data] Se esperaban 161 subindicadores, se generaron ${totalSubindicators}`);
}

console.log(
  `[csa-2026-replica-data] Réplica CSA 2026 generada: ${totalDimensions} dimensiones, ${totalIndicators} indicadores, ${totalSubindicators} subindicadores, ${totalElements} elementos de formulario`,
);

export { replicaData };
