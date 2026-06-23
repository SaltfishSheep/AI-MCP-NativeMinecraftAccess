export interface VersionConfig {
  workflow: 'legacy_srg' | 'legacy' | 'legacy_proguard' | 'modern';
  srg_url?: string;
  tsrg_url?: string;
  mcp_stable_url?: string | null;
  proguard_url?: string | null;
}

export interface MappingEntry {
  obf_class: string;
  deobf_class: string;
  type: 'field' | 'method';
  obf_name: string;
  deobf_name: string;
  srg_name: string;
  desc: string;
  is_static: boolean;
  sideonly: 'common' | 'server' | 'client';
}

export interface MappingInfo {
  [version: string]: string;
}

export interface SearchParams {
  mc_version: string;
  expression: string;
  page?: number;
}

/** Result of evaluating a single AST node against a row */
export interface MatchResult {
  /** Whether the row matches the expression at all */
  matched: boolean;
  /** Match score: sum of per-term match values (exact=1.0, case-insensitive=0.5) */
  match: number;
}

/** MappingEntry extended with scoring info */
export interface ScoredMappingEntry extends MappingEntry {
  match: number;
  mismatch: number;
}

/** Updated SearchResult to use ScoredMappingEntry */
export interface SearchResult {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  results: ScoredMappingEntry[];
}

export const SIDE_MAP: Record<string, MappingEntry['sideonly']> = {
  '0': 'common',
  '1': 'server',
  '2': 'client',
};

export const DEFAULT_LIMIT = 20;
export const CACHE_DIR = '.mapping-caches';
export const SEARCH_COLUMNS = ['obf_class', 'deobf_class', 'obf_name', 'deobf_name', 'srg_name'] as const;
export const CLASS_COLUMNS = ['obf_class', 'deobf_class'] as const;
export const NAME_COLUMNS = ['obf_name', 'deobf_name', 'srg_name'] as const;
export const DESC_COLUMNS = ['desc'] as const;
