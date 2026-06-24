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
  obf_desc: string;
  deobf_desc: string;
  access: 'public' | 'protected' | 'default' | 'private' | '';
  is_static: 'static' | 'non-static';
  sideonly: 'common' | 'server' | 'client';
}

export interface MappingInfo {
  [version: string]: string;
}

/** MappingEntry extended with scoring info */
export interface ScoredMappingEntry extends MappingEntry {
  match: number;
  mismatch: number;
}

export const SIDE_MAP: Partial<Record<string, MappingEntry['sideonly']>> = {
  '0': 'common',
  '1': 'server',
  '2': 'client',
};

export const DEFAULT_LIMIT = 20;

export const SEARCH_COLUMNS = ['obf_class', 'deobf_class', 'obf_name', 'deobf_name', 'srg_name', 'obf_desc', 'deobf_desc', 'access', 'is_static'] as const;
