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

export interface SearchResult {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  results: MappingEntry[];
}

export const SIDE_MAP: Record<string, MappingEntry['sideonly']> = {
  '0': 'common',
  '1': 'server',
  '2': 'client',
};

export const PAGE_SIZE = 10;
export const CACHE_DIR = '.mapping-caches';
export const SEARCH_COLUMNS = ['obf_class', 'deobf_class', 'obf_name', 'deobf_name', 'srg_name'] as const;
