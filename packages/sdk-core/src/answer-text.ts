// Separa el texto serializado de una respuesta (formatAnswer) en una frase
// principal + tablas estructuradas, para que el Consolidado pueda mostrar
// tablas reales en vez de un bloque de texto plano. El CSV/XLSX siguen usando
// el texto original; esto es solo presentación.
// Formato de origen: "Opción (Tabla: Fila 2: Col A=x, Col B=y; Fila 3: …) (Tabla 2: …) — sub; sub".

export interface AnswerTable {
  title: string;
  headers: string[];
  rows: Array<{ label: string; cells: Record<string, string> }>;
}

export interface AnswerParts {
  lead: string;
  tables: AnswerTable[];
}

function parseTableBody(title: string, body: string): AnswerTable {
  const headers: string[] = [];
  const rows = body.split(/;\s+(?=[^;=]*?:\s)/).map((raw) => {
    const idx = raw.indexOf(": ");
    const label = idx >= 0 ? raw.slice(0, idx).trim() : "";
    const rest = idx >= 0 ? raw.slice(idx + 2) : raw;
    const cells: Record<string, string> = {};
    // "A=1, B=2" — la coma separa celdas solo si lo que sigue es "Nombre="
    for (const part of rest.split(/,\s+(?=[^,=]+=)/)) {
      const eq = part.indexOf("=");
      if (eq < 0) continue;
      const k = part.slice(0, eq).trim();
      if (!headers.includes(k)) headers.push(k);
      cells[k] = part.slice(eq + 1).trim();
    }
    return { label, cells };
  });
  return { title, headers, rows };
}

export function splitAnswerText(text: string): AnswerParts {
  const tables: AnswerTable[] = [];
  const re = /\s*\((Tabla(?: \d+)?): ((?:[^()]|\([^()]*\))*)\)/g;
  const lead = text
    .replace(re, (_m, title: string, body: string) => {
      tables.push(parseTableBody(title, body));
      return "";
    })
    .replace(/\s{2,}/g, " ")
    .trim();
  return { lead, tables };
}
