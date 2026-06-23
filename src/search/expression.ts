// AST Node types

export interface TermNode {
  type: 'term';
  term: string;           // lowercased, used for matching
  originalTerm: string;   // original case from user input, used for scoring
  modifier?: 'all' | 'class' | 'name' | 'method' | 'field' | 'desc' | 'static' | 'sideonly';
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
  /** The set of columns that were in scope for this term (for mismatch computation) */
  modifierColumns: readonly string[];
}

const VALID_MODIFIERS = new Set(['all', 'class', 'name', 'method', 'field', 'desc', 'static', 'sideonly']);

// Column sets for modifiers — determines which columns are searched and scored
const MODIFIER_COLUMNS: Record<string, readonly string[]> = {
  all:      ['obf_class', 'deobf_class', 'obf_name', 'deobf_name', 'srg_name', 'desc'],
  class:    ['obf_class', 'deobf_class'],
  name:     ['obf_name', 'deobf_name', 'srg_name'],
  method:   ['obf_class', 'deobf_class', 'obf_name', 'deobf_name', 'srg_name', 'desc'],
  field:    ['obf_class', 'deobf_class', 'obf_name', 'deobf_name', 'srg_name', 'desc'],
  desc:     ['desc'],
  static:   ['obf_class', 'deobf_class', 'obf_name', 'deobf_name', 'srg_name', 'desc'],
  sideonly: ['obf_class', 'deobf_class', 'obf_name', 'deobf_name', 'srg_name', 'desc'],
};

// Type/property filters for modifiers
// null = no filter, 'method' = methods only, 'field' = fields only,
// 'method_or_field' = methods+fields, 'static' = static only, 'sideonly' = common only
const MODIFIER_TYPE_FILTER: Record<string, string | null> = {
  all:      null,
  class:    null,
  name:     'method_or_field',
  method:   'method',
  field:    'field',
  desc:     null,
  static:   'static',
  sideonly: 'sideonly',
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
          // Valid modifier: emit termOriginal:termLower:modifier
          tokens.push(termPart + ':' + termPart.toLowerCase() + ':' + modifierPart);
        } else {
          // Invalid modifier: emit termOriginal:termLower
          tokens.push(term + ':' + term.toLowerCase());
        }
      } else {
        tokens.push(term + ':' + term.toLowerCase());
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
  // Token format: "original:lower" or "original:lower:modifier"
  const parts = token.split(':');
  if (parts.length === 3) {
    // original:lower:modifier
    return [{ type: 'term', term: parts[1], originalTerm: parts[0], modifier: parts[2] as TermNode['modifier'] }, pos + 1];
  }
  if (parts.length === 2) {
    // original:lower
    return [{ type: 'term', term: parts[1], originalTerm: parts[0] }, pos + 1];
  }
  // Fallback (shouldn't happen)
  return [{ type: 'term', term: token.toLowerCase(), originalTerm: token }, pos + 1];
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
      const modifier = node.modifier ?? 'all';

      // Type/property filter
      const typeFilter = MODIFIER_TYPE_FILTER[modifier];
      if (typeFilter === 'method' && row['type'] !== 'method') {
        return { matched: false, match: 0, modifierColumns: [] };
      }
      if (typeFilter === 'field' && row['type'] !== 'field') {
        return { matched: false, match: 0, modifierColumns: [] };
      }
      if (typeFilter === 'method_or_field' && row['type'] !== 'method' && row['type'] !== 'field') {
        return { matched: false, match: 0, modifierColumns: [] };
      }
      if (typeFilter === 'static' && row['is_static'] !== 'true') {
        return { matched: false, match: 0, modifierColumns: [] };
      }
      if (typeFilter === 'sideonly' && row['sideonly'] !== 'common') {
        return { matched: false, match: 0, modifierColumns: [] };
      }

      // Column selection
      const columns = MODIFIER_COLUMNS[modifier] ?? searchColumns;
      return matchTermInColumns(node.term, node.originalTerm, row, columns);
    }
    case 'and': {
      const left = evaluateNode(node.left, row, searchColumns);
      if (!left.matched) return { matched: false, match: 0, modifierColumns: [] };
      const right = evaluateNode(node.right, row, searchColumns);
      if (!right.matched) return { matched: false, match: 0, modifierColumns: [] };
      return {
        matched: true,
        match: left.match + right.match,
        modifierColumns: [...new Set([...left.modifierColumns, ...right.modifierColumns])],
      };
    }
    case 'or': {
      const left = evaluateNode(node.left, row, searchColumns);
      const right = evaluateNode(node.right, row, searchColumns);
      if (!left.matched && !right.matched) return { matched: false, match: 0, modifierColumns: [] };
      if (left.matched && !right.matched) return left;
      if (!left.matched && right.matched) return right;
      return left.match >= right.match ? left : right;
    }
  }
}

function matchTermInColumns(
  term: string,
  originalTerm: string,
  row: Record<string, string>,
  columns: readonly string[]
): MatchResult {
  let bestMatch = 0;
  let bestCol = '';
  for (const col of columns) {
    const value = row[col] ?? '';
    if (value.includes(originalTerm)) {
      return { matched: true, match: 1.0, modifierColumns: columns };
    }
    if (value.toLowerCase().includes(term)) {
      if (0.5 > bestMatch) {
        bestMatch = 0.5;
        bestCol = col;
      }
    }
  }
  if (bestMatch > 0) {
    return { matched: true, match: bestMatch, modifierColumns: columns };
  }
  return { matched: false, match: 0, modifierColumns: [] };
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
      return { type: 'term', term: node.term, originalTerm: node.originalTerm, modifier: 'class' };
    case 'and':
      return { type: 'and', left: forceClassModifier(node.left), right: forceClassModifier(node.right) };
    case 'or':
      return { type: 'or', left: forceClassModifier(node.left), right: forceClassModifier(node.right) };
  }
}
