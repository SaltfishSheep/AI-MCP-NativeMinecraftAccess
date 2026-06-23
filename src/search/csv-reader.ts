import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ScoredMappingEntry, SearchResult, CACHE_DIR, DEFAULT_LIMIT, SEARCH_COLUMNS, SIDE_MAP } from '../types.js';
import { ASTNode, evaluateNode, extractTerms, forceClassModifier } from './expression.js';

// Resolve package.json path relative to this source file (works from src/ or dist/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON_PATH = path.resolve(__dirname, '..', '..', 'package.json');

function getPackageVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as Record<string, unknown>;
    return (pkg['version'] as string) ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function parseCsvLine(line: string): string[] {
  return line.split(',').map(field => field.trim());
}

function rowToEntry(row: Record<string, string>, matchScore: number, mismatchScore: number): ScoredMappingEntry {
  const sideRaw = row['sideonly'] ?? '0';
  return {
    obf_class: row['obf_class'] ?? '',
    deobf_class: row['deobf_class'] ?? '',
    type: (row['type'] === 'method' ? 'method' : 'field'),
    obf_name: row['obf_name'] ?? '',
    deobf_name: row['deobf_name'] ?? '',
    srg_name: row['srg_name'] ?? '',
    desc: row['desc'] ?? '',
    is_static: row['is_static'] === 'true' || row['is_static'] === '1',
    sideonly: SIDE_MAP[sideRaw] ?? 'common',
    match: matchScore,
    mismatch: mismatchScore,
  };
}

function computeMismatch(row: Record<string, string>, terms: string[]): number {
  let mismatch = 0;
  for (const col of SEARCH_COLUMNS) {
    const value = (row[col] ?? '').toLowerCase();
    const matchedByAnyTerm = terms.some(term => value.includes(term));
    if (!matchedByAnyTerm) {
      mismatch += (row[col] ?? '').length;
    }
  }
  return mismatch;
}

export function validateCache(mcVersion: string, cacheDir: string = CACHE_DIR): boolean {
  const cacheFile = path.join(cacheDir, `${mcVersion}.csv`);
  const mappingInfoPath = path.join(cacheDir, 'mapping-info.json');

  if (!fs.existsSync(cacheFile)) return false;
  if (!fs.existsSync(mappingInfoPath)) return false;

  try {
    const expectedVersion = getPackageVersion();
    const mappingInfo: Record<string, unknown> = JSON.parse(fs.readFileSync(mappingInfoPath, 'utf-8'));
    const actualVersion = (mappingInfo[mcVersion] as string) ?? '';

    return actualVersion === expectedVersion;
  } catch {
    return false;
  }
}

export function searchCache(
  mcVersion: string,
  astRoot: ASTNode,
  page: number = 1,
  limit: number = DEFAULT_LIMIT,
  cacheDir: string = CACHE_DIR
): SearchResult {
  const cacheFile = path.join(cacheDir, `${mcVersion}.csv`);
  const content = fs.readFileSync(cacheFile, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    return { total: 0, page, limit, totalPages: 0, results: [] };
  }

  const header = parseCsvLine(lines[0]);
  const terms = extractTerms(astRoot);
  const scored: ScoredMappingEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = fields[j] ?? '';
    }
    const result = evaluateNode(astRoot, row, SEARCH_COLUMNS);
    if (result.matched) {
      const mismatch = computeMismatch(row, terms);
      scored.push(rowToEntry(row, result.match, mismatch));
    }
  }

  // Sort by match DESC, then mismatch ASC
  scored.sort((a, b) => {
    if (b.match !== a.match) return b.match - a.match;
    return a.mismatch - b.mismatch;
  });

  const total = scored.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const clampedPage = Math.max(1, Math.min(page, totalPages));
  const start = (clampedPage - 1) * limit;
  const results = scored.slice(start, start + limit);

  return { total, page: clampedPage, limit, totalPages, results };
}

/** Search for unique classes matching the expression (class columns only) */
export function searchClasses(
  mcVersion: string,
  astRoot: ASTNode,
  page: number = 1,
  limit: number = DEFAULT_LIMIT,
  cacheDir: string = CACHE_DIR
): SearchResult {
  const classAst = forceClassModifier(astRoot);
  const cacheFile = path.join(cacheDir, `${mcVersion}.csv`);
  const content = fs.readFileSync(cacheFile, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    return { total: 0, page, limit, totalPages: 0, results: [] };
  }

  const header = parseCsvLine(lines[0]);
  const terms = extractTerms(astRoot);
  const seen = new Set<string>();
  const scored: ScoredMappingEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = fields[j] ?? '';
    }
    const result = evaluateNode(classAst, row, SEARCH_COLUMNS);
    if (result.matched) {
      const classKey = `${row['obf_class']}\0${row['deobf_class']}`;
      if (!seen.has(classKey)) {
        seen.add(classKey);
        const mismatch = computeMismatch(row, terms);
        scored.push(rowToEntry(row, result.match, mismatch));
      }
    }
  }

  // Sort by match DESC, then mismatch ASC
  scored.sort((a, b) => {
    if (b.match !== a.match) return b.match - a.match;
    return a.mismatch - b.mismatch;
  });

  const total = scored.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const clampedPage = Math.max(1, Math.min(page, totalPages));
  const start = (clampedPage - 1) * limit;
  const results = scored.slice(start, start + limit);

  return { total, page: clampedPage, limit, totalPages, results };
}

export function formatRow(row: Record<string, string>): string {
  const desc = row['desc'] ?? '';
  const descPart = desc ? `  desc=${desc}` : '';
  return `[${row['type'] ?? '?'}] ${row['obf_class'] ?? ''}.${row['obf_name'] ?? ''} -> ${row['deobf_class'] ?? ''}.${row['deobf_name'] ?? ''}  srg=${row['srg_name'] ?? ''}${descPart}  sideonly=${row['sideonly'] ?? ''}`;
}
