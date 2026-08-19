// Contrato del motor engine/formula v1 (ver docs/engines/formula.md).
// Parser/evaluador recursivo-descendente hecho a mano, sin librería de
// expresiones (NFR-3): suma, resta, multiplicación, división, paréntesis,
// menos unario y referencias {id} a otros Elementos del mismo Subindicador.

export class FormulaSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormulaSyntaxError";
  }
}

interface NumberNode {
  kind: "number";
  value: number;
}

interface RefNode {
  kind: "ref";
  id: string;
}

interface BinaryNode {
  kind: "binary";
  operator: "+" | "-" | "*" | "/";
  left: FormulaNode;
  right: FormulaNode;
}

interface UnaryNode {
  kind: "unary";
  operator: "-";
  operand: FormulaNode;
}

export type FormulaNode = NumberNode | RefNode | BinaryNode | UnaryNode;

// Tokenizador: convierte la cadena en una lista de tokens (siempre termina
// con "eof"). Los errores léxicos (carácter no reconocido, referencia sin
// cerrar) se reportan aquí, como FormulaSyntaxError.
type TokenType =
  | "number"
  | "ref"
  | "plus"
  | "minus"
  | "star"
  | "slash"
  | "lparen"
  | "rparen"
  | "eof";

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

const singleCharTokens: Record<string, TokenType> = {
  "+": "plus",
  "-": "minus",
  "*": "star",
  "/": "slash",
  "(": "lparen",
  ")": "rparen",
};

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    if (isDigit(ch)) {
      const start = i;
      i += 1;
      while (i < source.length && isDigit(source[i]!)) i += 1;
      if (i < source.length && source[i] === ".") {
        if (i + 1 >= source.length || !isDigit(source[i + 1]!)) {
          throw new FormulaSyntaxError("Número mal formado: falta un dígito después del punto");
        }
        i += 1;
        while (i < source.length && isDigit(source[i]!)) i += 1;
      }
      tokens.push({ type: "number", value: source.slice(start, i), position: start });
      continue;
    }
    if (ch === "{") {
      let j = i + 1;
      while (j < source.length && source[j] !== "}") j += 1;
      if (j >= source.length) {
        throw new FormulaSyntaxError('Referencia sin cerrar: falta "}"');
      }
      tokens.push({ type: "ref", value: source.slice(i + 1, j), position: i });
      i = j + 1;
      continue;
    }
    const type = singleCharTokens[ch];
    if (type === undefined) {
      throw new FormulaSyntaxError(`Carácter no reconocido: "${ch}"`);
    }
    tokens.push({ type, value: ch, position: i });
    i += 1;
  }
  tokens.push({ type: "eof", value: "", position: source.length });
  return tokens;
}

// Parser recursivo-descendente. Gramática:
//   expression := term (('+' | '-') term)*
//   term       := factor (('*' | '/') factor)*
//   factor     := number | reference | '(' expression ')' | '-' factor
export function parseFormula(expression: string): FormulaNode {
  const tokens = tokenize(expression);
  let pos = 0;

  const current = (): Token => tokens[pos]!;
  const advance = (): Token => {
    const token = tokens[pos]!;
    pos += 1;
    return token;
  };

  const parseExpression = (): FormulaNode => {
    let node = parseTerm();
    for (;;) {
      const token = current();
      if (token.type !== "plus" && token.type !== "minus") return node;
      advance();
      node = {
        kind: "binary",
        operator: token.type === "plus" ? "+" : "-",
        left: node,
        right: parseTerm(),
      };
    }
  };

  const parseTerm = (): FormulaNode => {
    let node = parseFactor();
    for (;;) {
      const token = current();
      if (token.type !== "star" && token.type !== "slash") return node;
      advance();
      node = {
        kind: "binary",
        operator: token.type === "star" ? "*" : "/",
        left: node,
        right: parseFactor(),
      };
    }
  };

  const parseFactor = (): FormulaNode => {
    const token = current();
    switch (token.type) {
      case "number":
        advance();
        return { kind: "number", value: Number(token.value) };
      case "ref":
        advance();
        return { kind: "ref", id: token.value };
      case "lparen": {
        advance();
        const node = parseExpression();
        if (current().type !== "rparen") {
          throw new FormulaSyntaxError("Paréntesis sin cerrar");
        }
        advance();
        return node;
      }
      case "minus": {
        advance();
        return { kind: "unary", operator: "-", operand: parseFactor() };
      }
      case "eof":
        throw new FormulaSyntaxError(
          token.position === 0 ? "Expresión vacía" : "Token inesperado: fin de la expresión",
        );
      default:
        throw new FormulaSyntaxError(`Token inesperado: "${token.value}"`);
    }
  };

  const node = parseExpression();
  const trailing = current();
  if (trailing.type !== "eof") {
    throw new FormulaSyntaxError(`Token inesperado: "${trailing.value}"`);
  }
  return node;
}

// Recorre el AST en orden (izquierda antes que derecha) para respetar el
// orden de aparición de las referencias en el texto de la fórmula.
export function extractExpressionReferences(expression: string): string[] {
  let node: FormulaNode;
  try {
    node = parseFormula(expression);
  } catch {
    return [];
  }

  const result: string[] = [];
  const seen = new Set<string>();
  const walk = (n: FormulaNode): void => {
    switch (n.kind) {
      case "ref":
        if (!seen.has(n.id)) {
          seen.add(n.id);
          result.push(n.id);
        }
        break;
      case "binary":
        walk(n.left);
        walk(n.right);
        break;
      case "unary":
        walk(n.operand);
        break;
      case "number":
        break;
    }
  };
  walk(node);
  return result;
}

function evaluateNode(node: FormulaNode, values: Record<string, number>): number | undefined {
  switch (node.kind) {
    case "number":
      return node.value;
    case "ref": {
      const value = values[node.id];
      return value === undefined ? undefined : value;
    }
    case "unary": {
      const operand = evaluateNode(node.operand, values);
      return operand === undefined ? undefined : -operand;
    }
    case "binary": {
      const left = evaluateNode(node.left, values);
      if (left === undefined) return undefined;
      const right = evaluateNode(node.right, values);
      if (right === undefined) return undefined;
      switch (node.operator) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return right === 0 ? undefined : left / right;
      }
    }
  }
}

// Nunca lanza: el Runtime lo usa en cada tecla, un error de cálculo no debe
// romper la página. undefined si la expresión no parsea, si falta alguna
// referencia, o en división por cero.
export function evaluateExpression(
  expression: string,
  values: Record<string, number>,
): number | undefined {
  let node: FormulaNode;
  try {
    node = parseFormula(expression);
  } catch {
    return undefined;
  }
  return evaluateNode(node, values);
}

// VS-043 (docs/engines/form.md "Fila de fórmula dentro de tabla_datos"),
// corregido en VS-047 (docs/engines/form.md "Editor de tabla_datos estilo
// grilla" — hallazgo: la versión anterior indexaba `valuesByRow` por
// posición numérica con claves sintéticas `ref_N` que nunca podían calzar
// con una referencia real `{rowId}` escrita por el admin; nunca tuvo tests
// ni se conectó a ningún consumidor, así que el bug no se manifestó hasta
// ahora). Motor de evaluación de fórmulas de tabla con contexto de
// fila/columna: `{rowId}` resuelve el valor de esa fila en la COLUMNA que se
// está evaluando (`columnId`); `{rowId.columnId}` resuelve una celda
// puntual, columna explícita. `valuesByRow` es `rowId -> columnId -> valor`
// (mismo shape que `TableValue` de `response.ts`, sin duplicar el tipo aquí
// para no crear una dependencia circular entre paquetes).
//
// VS-077 (docs/engines/form.md "Fórmulas — extensión de la sintaxis de
// referencia"): una celda de la Fase 2 (`components`) guarda un mapa
// `componentId -> número` en vez de un escalar — `valuesByRow[row][col]`
// ahora también puede ser ese mapa. Sintaxis aditiva `{rowId::componentId}` /
// `{rowId.columnId::componentId}` (el separador `.` fila/columna no cambia,
// solo se agrega un segundo split por `::` sobre la porción resultante).
// Sin `::componentId`, una celda-mapa solo resuelve si tiene EXACTAMENTE 1
// entrada numérica (mismo criterio "sin ambigüedad silenciosa" del doc,
// aplicado acá en tiempo de evaluación — la validación de autoría que
// rechaza esa ambigüedad en el Builder queda fuera de alcance de VS-077,
// ver "Fuera de alcance" en el doc).
export function evaluateTableExpression(
  expression: string,
  columnId: string,
  valuesByRow: Record<string, Record<string, number | Record<string, number | undefined> | undefined>>,
): number | undefined {
  let node: FormulaNode;
  try {
    node = parseFormula(expression);
  } catch {
    return undefined;
  }

  const values: Record<string, number> = {};
  for (const ref of extractExpressionReferences(expression)) {
    const sepIdx = ref.indexOf("::");
    const mainPart = sepIdx === -1 ? ref : ref.slice(0, sepIdx);
    const componentId = sepIdx === -1 ? undefined : ref.slice(sepIdx + 2);
    const dotIdx = mainPart.indexOf(".");
    const rowId = dotIdx === -1 ? mainPart : mainPart.slice(0, dotIdx);
    const col = dotIdx === -1 ? columnId : mainPart.slice(dotIdx + 1);
    const cell = valuesByRow[rowId]?.[col];

    let value: number | undefined;
    if (typeof cell === "number") {
      value = componentId === undefined ? cell : undefined;
    } else if (cell && typeof cell === "object") {
      if (componentId !== undefined) {
        value = cell[componentId];
      } else {
        const keys = Object.keys(cell);
        value = keys.length === 1 ? cell[keys[0]!] : undefined;
      }
    }
    if (value !== undefined) values[ref] = value;
  }
  return evaluateNode(node, values);
}
