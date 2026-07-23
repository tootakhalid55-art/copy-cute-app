// Tiny, safe numeric expression evaluator for posting rules.
// Supports: numbers, identifiers (payload keys), + - * / ( ) and unary minus.
// No function calls, no strings, no property access.

type Token = { type: "num" | "id" | "op" | "lp" | "rp"; value: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t") { i++; continue; }
    if (c === "(") { out.push({ type: "lp", value: c }); i++; continue; }
    if (c === ")") { out.push({ type: "rp", value: c }); i++; continue; }
    if ("+-*/".includes(c)) { out.push({ type: "op", value: c }); i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ type: "num", value: src.slice(i, j) });
      i = j; continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      out.push({ type: "id", value: src.slice(i, j) });
      i = j; continue;
    }
    throw new Error(`expr: unexpected char '${c}' in "${src}"`);
  }
  return out;
}

// Recursive-descent: expr = term (('+'|'-') term)*; term = factor (('*'|'/') factor)*;
// factor = '-' factor | '(' expr ')' | num | id
export function evalExpr(src: string, scope: Record<string, number>): number {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = (t: string) => {
    const tk = tokens[pos];
    if (!tk || tk.value !== t) throw new Error(`expr: expected '${t}'`);
    pos++;
    return tk;
  };
  function parseFactor(): number {
    const tk = peek();
    if (!tk) throw new Error("expr: unexpected end");
    if (tk.type === "op" && tk.value === "-") { pos++; return -parseFactor(); }
    if (tk.type === "op" && tk.value === "+") { pos++; return parseFactor(); }
    if (tk.type === "lp") { pos++; const v = parseExpr(); eat(")"); return v; }
    if (tk.type === "num") { pos++; return parseFloat(tk.value); }
    if (tk.type === "id") { pos++; const v = scope[tk.value]; return typeof v === "number" && Number.isFinite(v) ? v : 0; }
    throw new Error(`expr: unexpected token '${tk.value}'`);
  }
  function parseTerm(): number {
    let left = parseFactor();
    while (peek() && peek().type === "op" && (peek().value === "*" || peek().value === "/")) {
      const op = tokens[pos++].value;
      const right = parseFactor();
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }
  function parseExpr(): number {
    let left = parseTerm();
    while (peek() && peek().type === "op" && (peek().value === "+" || peek().value === "-")) {
      const op = tokens[pos++].value;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  const v = parseExpr();
  if (pos !== tokens.length) throw new Error("expr: trailing tokens");
  return v;
}
