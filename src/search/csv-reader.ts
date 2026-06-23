import * as fs from 'node:fs';
import * as path from 'node:path';
import { MappingEntry, ScoredMappingEntry, SearchResult, CACHE_DIR, DEFAULT_LIMIT, SEARCH_COLUMNS, SIDE_MAP } from '../types.js';
import { ASTNode, evaluateNode, extractTerms, getColumnValue } from './expression.js';
import { getPackageVersion, parseCsvLine } from '../util.js';

function rowToEntry(row: Record<string, string>, matchScore: number, mismatchScore: number): ScoredMappingEntry {
  const sideRaw = row['sideonly'] ?? '0';
  const accessRaw = row['access'] ?? '';
  const validAccess = ['public', 'protected', 'default', 'private'].includes(accessRaw) ? accessRaw as MappingEntry['access'] : '';
  const isStaticRaw = row['is_static'] ?? 'non-static';
  return {
    obf_class: row['obf_class'] ?? '',
    deobf_class: row['deobf_class'] ?? '',
    type: (row['type'] === 'method' ? 'method' : 'field'),
    obf_name: row['obf_name'] ?? '',
    deobf_name: row['deobf_name'] ?? '',
    srg_name: row['srg_name'] ?? '',
    obf_desc: row['obf_desc'] ?? '',
    deobf_desc: row['deobf_desc'] ?? '',
    access: validAccess,
    is_static: isStaticRaw === 'static' ? 'static' : 'non-static',
    sideonly: SIDE_MAP[sideRaw] ?? 'common',
    match: matchScore,
    mismatch: mismatchScore,
  };
}

function computeMismatch(row: Record<string, string>, terms: string[], modifierColumns: readonly string[]): number {
  const columns = modifierColumns.length > 0 ? modifierColumns : SEARCH_COLUMNS;
  let totalUnmatched = 0;

  for (const col of columns) {
    const value = getColumnValue(row, col).toLowerCase();
    if (value.length === 0) continue;

    // Track which character positions are captured by any term
    const captured = new Uint8Array(value.length);

    for (const term of terms) {
      if (term.length === 0) continue;
      let searchFrom = 0;
      while (searchFrom <= value.length - term.length) {
        const idx = value.indexOf(term, searchFrom);
        if (idx === -1) break;
        // Mark all positions of this match as captured
        for (let k = idx; k < idx + term.length; k++) {
          captured[k] = 1;
        }
        searchFrom = idx + 1;
      }
    }

    // Count uncaptured characters
    let colMismatch = 0;
    for (let k = 0; k < captured.length; k++) {
      if (captured[k] === 0) colMismatch++;
    }
    totalUnmatched += colMismatch;
  }

  return totalUnmatched;
}

// In-memory cache for parsed CSV data (avoids re-reading disk on every query)
interface CachedData {
  header: string[];
  rows: Record<string, string>[];
}

let cacheVersion: string | null = null;
let cacheData: CachedData | null = null;

function getCachedRows(mcVersion: string, cacheDir: string): CachedData {
  if (cacheVersion === mcVersion && cacheData !== null) {
    return cacheData;
  }

  const cacheFile = path.join(cacheDir, `${mcVersion}.csv`);
  const content = fs.readFileSync(cacheFile, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    const empty: CachedData = { header: [], rows: [] };
    cacheVersion = mcVersion;
    cacheData = empty;
    return empty;
  }

  const header = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = fields[j] ?? '';
    }
    rows.push(row);
  }

  const result: CachedData = { header, rows };
  cacheVersion = mcVersion;
  cacheData = result;
  return result;
}

/** Invalidate cache (e.g., after rebuilding a version) */
export function invalidateCache(): void {
  cacheVersion = null;
  cacheData = null;
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
  const { header, rows } = getCachedRows(mcVersion, cacheDir);

  if (rows.length === 0) {
    return { total: 0, page, limit, totalPages: 0, results: [] };
  }

  const terms = extractTerms(astRoot);
  const scored: ScoredMappingEntry[] = [];

  for (let i = 0; i < rows.length; i++) {
    const result = evaluateNode(astRoot, rows[i], SEARCH_COLUMNS);
    if (result.matched) {
      const mismatch = computeMismatch(rows[i], terms, result.modifierColumns);
      scored.push(rowToEntry(rows[i], result.match, mismatch));
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

/** Return all matching entries sorted by score (no pagination). */
export function searchCacheAll(
  mcVersion: string,
  astRoot: ASTNode,
  cacheDir: string = CACHE_DIR
): ScoredMappingEntry[] {
  const { rows } = getCachedRows(mcVersion, cacheDir);
  if (rows.length === 0) return [];

  const terms = extractTerms(astRoot);
  const scored: ScoredMappingEntry[] = [];

  for (let i = 0; i < rows.length; i++) {
    const result = evaluateNode(astRoot, rows[i], SEARCH_COLUMNS);
    if (result.matched) {
      const mismatch = computeMismatch(rows[i], terms, result.modifierColumns);
      scored.push(rowToEntry(rows[i], result.match, mismatch));
    }
  }

  scored.sort((a, b) => {
    if (b.match !== a.match) return b.match - a.match;
    return a.mismatch - b.mismatch;
  });

  return scored;
}
