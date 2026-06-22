// AST Node types

export interface TermNode {
  type: 'term';
  term: string; // already lowercased
}

export interface AndNode {
  type: 'and';
  left: ASTNode;
  right: ASTNode;
}

export interface OrNode {
  type: 'or';
  left: ASTNode;
  right: ASTNode;
}

export type ASTNode = TermNode | AndNode | OrNode;

// Tokenizer: produces tokens '&', '|', '(', ')' , or a term string
function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    if (ch === '&' || ch === '|' || ch === '(' || ch === ')') {
      tokens.push(ch);
      i++;
      continue;
    }
    // Collect a term: contiguous non-special, non-whitespace characters
    let term = '';
    while (i < expr.length) {
      const c = expr[i];
      if (c === '&' || c === '|' || c === '(' || c === ')' || c === ' ' || c === '\t') {
        break;
      }
      term += c;
      i++;
    }
    if (term.length > 0) {
      tokens.push(term.toLowerCase());
    }
  }
  return tokens;
}

// Recursive descent parser (left-associative)
// Grammar:
//   or_expr  = and_expr ('|' and_expr)*
//   and_expr = atom ('&' atom)*
//   atom     = '(' or_expr ')' | term

function parseExpr(tokens: string[], pos: number): [ASTNode, number] {
  let [left, newPos] = parseAnd(tokens, pos);
  while (newPos < tokens.length && tokens[newPos] === '|') {
    newPos++; // skip '|'
    const [right, afterRight] = parseAnd(tokens, newPos);
    left = { type: 'or', left, right };
    newPos = afterRight;
  }
  return [left, newPos];
}

function parseAnd(tokens: string[], pos: number): [ASTNode, number] {
  let [left, newPos] = parseAtom(tokens, pos);
  while (newPos < tokens.length && tokens[newPos] === '&') {
    newPos++; // skip '&'
    const [right, afterRight] = parseAtom(tokens, newPos);
    left = { type: 'and', left, right };
    newPos = afterRight;
  }
  return [left, newPos];
}

function parseAtom(tokens: string[], pos: number): [ASTNode, number] {
  if (pos >= tokens.length) {
    throw new Error('Unexpected end of expression');
  }
  const token = tokens[pos];
  if (token === '(') {
    const [node, afterExpr] = parseExpr(tokens, pos + 1);
    if (afterExpr >= tokens.length || tokens[afterExpr] !== ')') {
      throw new Error('Missing closing parenthesis');
    }
    return [node, afterExpr + 1];
  }
  if (token === ')') {
    throw new Error(`Unexpected ')' at position ${pos}`);
  }
  if (token === '&' || token === '|') {
    throw new Error(`Unexpected operator '${token}' at position ${pos}`);
  }
  // It's a term
  return [{ type: 'term', term: token }, pos + 1];
}

export function parseExpression(expr: string): ASTNode {
  const tokens = tokenize(expr);
  if (tokens.length === 0) throw new Error('Empty expression');
  const [node, pos] = parseExpr(tokens, 0);
  if (pos < tokens.length) throw new Error(`Unexpected token '${tokens[pos]}' at position ${pos}`);
  return node;
}

export function evaluateNode(
  node: ASTNode,
  row: Record<string, string>,
  searchColumns: readonly string[]
): boolean {
  switch (node.type) {
    case 'term':
      return searchColumns.some(col => (row[col] ?? '').toLowerCase().includes(node.term));
    case 'and':
      return evaluateNode(node.left, row, searchColumns) && evaluateNode(node.right, row, searchColumns);
    case 'or':
      return evaluateNode(node.left, row, searchColumns) || evaluateNode(node.right, row, searchColumns);
  }
}
