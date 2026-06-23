// AST Node types

export interface TermNode {
  type: 'term';
  term: string; // already lowercased
  modifier?: 'class' | 'name' | 'method' | 'field' | 'desc';
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

/** Result of evaluating a single AST node against a row */
export interface MatchResult {
  /** Whether the row matches the expression at all */
  matched: boolean;
  /** Match score: sum of per-term match values (exact=1.0, case-insensitive=0.5) */
  match: number;
}

const VALID_MODIFIERS = new Set(['class', 'name', 'method', 'field', 'desc']);

// Column sets for modifiers
const MODIFIER_COLUMNS: Record<string, readonly string[]> = {
  class: ['obf_class', 'deobf_class'],
  name: ['obf_name', 'deobf_name', 'srg_name'],
  desc: ['desc'],
};

// Tokenizer: produces tokens '&', '|', '(', ')' , or a term string (potentially with :modifier)
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
    // Track colon position for modifier parsing
    let term = '';
    let colonPos = -1;
    while (i < expr.length) {
      const c = expr[i];
      if (c === '&' || c === '|' || c === '(' || c === ')' || c === ' ' || c === '\t') {
        break;
      }
      if (c === ':' && colonPos === -1) {
        colonPos = term.length;
      }
      term += c;
      i++;
    }
    if (term.length > 0) {
      if (colonPos >= 0) {
        const termPart = term.substring(0, colonPos);
        const modifierPart = term.substring(colonPos + 1);
        if (termPart.length > 0 && modifierPart.length > 0 && VALID_MODIFIERS.has(modifierPart)) {
          // Valid modifier: emit term:modifier
          tokens.push(termPart.toLowerCase() + ':' + modifierPart);
        } else {
          // Invalid modifier: treat whole thing as term
          tokens.push(term.toLowerCase());
        }
      } else {
        tokens.push(term.toLowerCase());
      }
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
  // It's a term — check for modifier
  const colonIdx = token.indexOf(':');
  if (colonIdx >= 0) {
    const term = token.substring(0, colonIdx);
    const modifier = token.substring(colonIdx + 1) as TermNode['modifier'];
    return [{ type: 'term', term, modifier }, pos + 1];
  }
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
): MatchResult {
  switch (node.type) {
    case 'term': {
      // Determine which columns to search based on modifier
      if (node.modifier === 'method') {
        if (row['type'] !== 'method') return { matched: false, match: 0 };
        // Type matches, now search all columns for the term
        return matchTermInColumns(node.term, row, searchColumns);
      }
      if (node.modifier === 'field') {
        if (row['type'] !== 'field') return { matched: false, match: 0 };
        // Type matches, now search all columns for the term
        return matchTermInColumns(node.term, row, searchColumns);
      }

      const columns = node.modifier ? (MODIFIER_COLUMNS[node.modifier] ?? searchColumns) : searchColumns;
      return matchTermInColumns(node.term, row, columns);
    }
    case 'and': {
      const left = evaluateNode(node.left, row, searchColumns);
      if (!left.matched) return { matched: false, match: 0 };
      const right = evaluateNode(node.right, row, searchColumns);
      if (!right.matched) return { matched: false, match: 0 };
      return { matched: true, match: left.match + right.match };
    }
    case 'or': {
      const left = evaluateNode(node.left, row, searchColumns);
      const right = evaluateNode(node.right, row, searchColumns);
      if (!left.matched && !right.matched) return { matched: false, match: 0 };
      return { matched: true, match: Math.max(left.match, right.match) };
    }
  }
}

function matchTermInColumns(
  term: string,
  row: Record<string, string>,
  columns: readonly string[]
): MatchResult {
  let bestMatch = 0;
  for (const col of columns) {
    const value = row[col] ?? '';
    // Exact case match
    if (value.includes(term)) {
      return { matched: true, match: 1.0 };
    }
    // Case-insensitive match
    if (value.toLowerCase().includes(term)) {
      bestMatch = Math.max(bestMatch, 0.5);
    }
  }
  if (bestMatch > 0) {
    return { matched: true, match: bestMatch };
  }
  return { matched: false, match: 0 };
}

/** Extract all leaf term strings from an AST node */
export function extractTerms(node: ASTNode): string[] {
  switch (node.type) {
    case 'term': return [node.term];
    case 'and': return [...extractTerms(node.left), ...extractTerms(node.right)];
    case 'or': return [...extractTerms(node.left), ...extractTerms(node.right)];
  }
}

/** Clone an AST node, forcing :class modifier on all terms */
export function forceClassModifier(node: ASTNode): ASTNode {
  switch (node.type) {
    case 'term':
      return { type: 'term', term: node.term, modifier: 'class' };
    case 'and':
      return { type: 'and', left: forceClassModifier(node.left), right: forceClassModifier(node.right) };
    case 'or':
      return { type: 'or', left: forceClassModifier(node.left), right: forceClassModifier(node.right) };
  }
}
