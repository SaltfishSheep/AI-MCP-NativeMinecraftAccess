// AST Node types

export interface TermNode {
  type: 'term';
  term: string;           // lowercased, used for matching
  originalTerm: string;   // original case from user input, used for scoring
  modifier?: 'all' | 'class' | 'name' | 'method' | 'field' | 'desc' | 'modifier' | 'side' | 'classname' | 'package';
  strongModifier?: boolean;
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

const VALID_MODIFIERS = new Set(['all', 'class', 'name', 'method', 'field', 'desc', 'modifier', 'side', 'classname', 'package']);

// Column sets for modifiers — determines which columns are searched and scored
const MODIFIER_COLUMNS: Record<string, readonly string[]> = {
  all:       ['obf_class', 'deobf_class', 'obf_name', 'deobf_name', 'srg_name', 'obf_desc', 'deobf_desc', 'access', 'is_static'],
  class:     ['obf_class', 'deobf_class'],
  classname: ['__classname__'],
  package:   ['__package__'],
  name:      ['obf_name', 'deobf_name', 'srg_name'],
  method:    ['obf_name', 'deobf_name', 'srg_name'],
  field:     ['obf_name', 'deobf_name', 'srg_name'],
  desc:      ['obf_desc', 'deobf_desc'],
  modifier:  ['access', 'is_static'],
  side:      ['sideonly'],
};

// Type/property filters for modifiers
// null = no filter, 'method_or_field' = methods+fields only
const MODIFIER_TYPE_FILTER: Record<string, string | null> = {
  all:       null,
  class:     null,
  classname: null,
  package:   null,
  name:      'method_or_field',
  method:    'method',
  field:     'field',
  desc:      null,
  modifier:  null,
  side:      null,
};

// Internal separator for token encoding — must not appear in user input.
// Using '\x00' (null byte) to avoid ambiguity with ':' which can appear in search terms.
const SEP = '\x00';

// Tokenizer: produces tokens '&', '|', '{', '}' , or a term string encoded as
// "original\x00lowered" or "original\x00lowered\x00modifier" or "original\x00lowered\x00modifier\x00strong"
function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    if (ch === '&' || ch === '|' || ch === '{' || ch === '}') {
      tokens.push(ch);
      i++;
      continue;
    }
    // Collect a term: contiguous non-special, non-whitespace characters
    let term = '';
    let separatorPos = -1;
    let isStrong = false;
    while (i < expr.length) {
      const c = expr[i];
      if (c === '&' || c === '|' || c === '{' || c === '}' || c === ' ' || c === '\t') {
        break;
      }
      if (c === ':' && separatorPos === -1) {
        separatorPos = term.length;
        // Check for '::' (strong modifier)
        if (i + 1 < expr.length && expr[i + 1] === ':') {
          isStrong = true;
          term += '::';
          i += 2;
          continue;
        }
      }
      term += c;
      i++;
    }
    if (term.length > 0) {
      if (separatorPos >= 0) {
        const termPart = term.substring(0, separatorPos);
        const modifierPart = isStrong ? term.substring(separatorPos + 2) : term.substring(separatorPos + 1);
        if (termPart.length > 0 && modifierPart.length > 0 && VALID_MODIFIERS.has(modifierPart)) {
          const suffix = isStrong ? SEP + 'strong' : '';
          tokens.push(termPart + SEP + termPart.toLowerCase() + SEP + modifierPart + suffix);
        } else {
          tokens.push(term + SEP + term.toLowerCase());
        }
      } else {
        tokens.push(term + SEP + term.toLowerCase());
      }
    }
  }
  return tokens;
}

// Recursive descent parser (left-associative)
// Grammar:
//   or_expr  = and_expr ('|' and_expr)*
//   and_expr = atom ('&' atom)*
//   atom     = '{' or_expr '}' | term

function parseExpr(tokens: string[], pos: number, fromBrace?: boolean): [ASTNode, number] {
  let [left, newPos] = parseAnd(tokens, pos);
  while (newPos < tokens.length && tokens[newPos] === '|') {
    newPos++; // skip '|'
    const [right, afterRight] = parseAnd(tokens, newPos);
    left = { type: 'or', left, right };
    newPos = afterRight;
  }
  if (fromBrace && newPos >= tokens.length) {
    throw new Error('Missing closing brace }');
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
  if (token === '{') {
    const [node, afterExpr] = parseExpr(tokens, pos + 1, true);
    if (afterExpr >= tokens.length || tokens[afterExpr] !== '}') {
      throw new Error('Missing closing brace }');
    }
    return [node, afterExpr + 1];
  }
  if (token === '}') {
    throw new Error(`Unexpected '}' at position ${pos}`);
  }
  if (token === '&' || token === '|') {
    throw new Error(`Unexpected operator '${token}' at position ${pos}`);
  }
  // It's a term — check for modifier
  // Token format: "original\x00lower" or "original\x00lower\x00modifier" or "original\x00lower\x00modifier\x00strong"
  const parts = token.split(SEP);
  if (parts.length === 4 && parts[3] === 'strong') {
    return [{ type: 'term', term: parts[1], originalTerm: parts[0], modifier: parts[2] as TermNode['modifier'], strongModifier: true }, pos + 1];
  }
  if (parts.length === 3) {
    return [{ type: 'term', term: parts[1], originalTerm: parts[0], modifier: parts[2] as TermNode['modifier'] }, pos + 1];
  }
  if (parts.length === 2) {
    return [{ type: 'term', term: parts[1], originalTerm: parts[0] }, pos + 1];
  }
  // Fallback (shouldn't happen)
  return [{ type: 'term', term: token.toLowerCase(), originalTerm: token }, pos + 1];
}

/** Expand dot-notation class paths (e.g. "net.minecraft.Entity") into OR nodes
 *  matching both slash paths ("net/minecraft/Entity") and inner class paths ("net/minecraft$Entity"). */
function expandDotTerms(node: ASTNode): ASTNode {
  switch (node.type) {
    case 'term': {
      if (node.term.includes('.')) {
        const parts = node.term.split('.');
        if (parts.length >= 2) {
          const slashPath = parts.join('/');
          const dollarPath = parts.slice(0, -1).join('/') + '$' + parts[parts.length - 1];
          // Also expand the original term for scoring
          const origParts = node.originalTerm.split('.');
          const origSlashPath = origParts.join('/');
          const origDollarPath = origParts.slice(0, -1).join('/') + '$' + origParts[origParts.length - 1];
          return {
            type: 'or',
            left: { ...node, term: slashPath, originalTerm: origSlashPath },
            right: { ...node, term: dollarPath, originalTerm: origDollarPath },
          };
        }
      }
      return node;
    }
    case 'and':
      return { type: 'and', left: expandDotTerms(node.left), right: expandDotTerms(node.right) };
    case 'or':
      return { type: 'or', left: expandDotTerms(node.left), right: expandDotTerms(node.right) };
  }
}

export function parseExpression(expr: string): ASTNode {
  const tokens = tokenize(expr);
  if (tokens.length === 0) throw new Error('Empty expression');
  const [node, pos] = parseExpr(tokens, 0);
  if (pos < tokens.length) throw new Error(`Unexpected token '${tokens[pos]}' at position ${pos}`);
  return expandDotTerms(node);
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

      // Column selection
      const columns = MODIFIER_COLUMNS[modifier] ?? searchColumns;
      return matchTermInColumns(node.term, node.originalTerm, row, columns, node.strongModifier);
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
  columns: readonly string[],
  strongModifier?: boolean
): MatchResult {
  let bestMatch = 0;
  for (const col of columns) {
    const value = getColumnValue(row, col);

    if (strongModifier) {
      // Strong modifier: exact case-sensitive match required
      if (value === originalTerm) {
        return { matched: true, match: 1.0, modifierColumns: columns };
      }
    } else {
      // Normal modifier: substring match (exact case = 1.0, case-insensitive = 0.5)
      if (value.includes(originalTerm)) {
        return { matched: true, match: 1.0, modifierColumns: columns };
      }
      if (value.toLowerCase().includes(term)) {
        if (0.5 > bestMatch) {
          bestMatch = 0.5;
        }
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

/** Get the effective value for a column, handling virtual columns. */
export function getColumnValue(row: Record<string, string>, col: string): string {
  if (col === '__classname__') {
    const deobfClass = row['deobf_class'] ?? '';
    const lastSlash = deobfClass.lastIndexOf('/');
    return lastSlash >= 0 ? deobfClass.substring(lastSlash + 1) : deobfClass;
  }
  if (col === '__package__') {
    const deobfClass = row['deobf_class'] ?? '';
    const lastSlash = deobfClass.lastIndexOf('/');
    return lastSlash >= 0 ? deobfClass.substring(0, lastSlash) : '';
  }
  return row[col] ?? '';
}
