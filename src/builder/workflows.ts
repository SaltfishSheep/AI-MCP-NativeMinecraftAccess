import type { MappingEntry, VersionConfig } from '../types.js';
import { SIDE_MAP } from '../types.js';
import { fetchBytes, fetchText, extractFromZip, extractOptionalFromZip } from './download.js';
import {
  parseSrg,
  parseTsrgv1,
  parseTsrgv2,
  parseProguard,
  parseMcpCsv,
  parseStaticMethods,
  parseConstructors,
} from './parsers.js';

// ============================================================================
// Shared Helpers for Merge Builders
// ============================================================================

/** Assert that a required URL is configured, throwing a clear error if not. */
function requireUrl(url: string | null | undefined, name: string, workflow: string, mcVersion: string): string {
  if (!url) throw new Error(`Workflow '${workflow}' for MC ${mcVersion} requires ${name} but it was not configured`);
  return url;
}

/**
 * Check if a method is static by looking up its SRG name.
 */
function checkStatic(srgName: string, staticMethods: Set<string>): 'static' | 'non-static' {
  return staticMethods.has(srgName.replace(/_+$/, '')) ? 'static' : 'non-static';
}

/**
 * Convert a JVM type descriptor by replacing obfuscated class names with deobfuscated ones.
 * Example: (Lbhy;)Z -> (Lnet/minecraft/client/settings/KeyBinding;)Z
 */
function convertDescriptor(obfDesc: string, classMap: Map<string, string>): string {
  let result = '';
  let i = 0;
  while (i < obfDesc.length) {
    const ch = obfDesc[i];
    if (ch === 'L') {
      // Read class name until ';'
      let className = '';
      i++; // skip 'L'
      while (i < obfDesc.length && obfDesc[i] !== ';') {
        className += obfDesc[i];
        i++;
      }
      if (i < obfDesc.length) i++; // skip ';'
      const deobfName = classMap.get(className) ?? className;
      result += 'L' + deobfName + ';';
    } else {
      result += ch;
      i++;
    }
  }
  return result;
}

/**
 * Compute deobf_desc for all entries using the class mapping.
 * Processes any entry that has obf_desc (both methods and fields after JAR enrichment).
 */
export function computeDeobfDesc(entries: MappingEntry[], classMap: Map<string, string>): void {
  for (const entry of entries) {
    if (entry.obf_desc) {
      entry.deobf_desc = convertDescriptor(entry.obf_desc, classMap);
    }
  }
}

// ============================================================================
// Entry Factory
// ============================================================================

/** Default MappingEntry — all string fields empty, type/enum fields at safe defaults. */
const ENTRY_DEFAULTS: Omit<MappingEntry, 'type'> = {
  obf_class: '',
  deobf_class: '',
  obf_name: '',
  deobf_name: '',
  srg_name: '',
  access: '',
  obf_desc: '',
  deobf_desc: '',
  is_static: 'non-static',
  sideonly: 'common',
};

/** Create a MappingEntry with defaults for all unspecified fields. */
function makeEntry(overrides: Partial<MappingEntry> & Pick<MappingEntry, 'type'>): MappingEntry {
  return { ...ENTRY_DEFAULTS, ...overrides };
}

/**
 * Download MCP stable ZIP and extract fields.csv + methods.csv.
 */
async function fetchMcpCsvPair(
  mcpStableUrl: string
): Promise<{ csvFields: ReturnType<typeof parseMcpCsv>; csvMethods: ReturnType<typeof parseMcpCsv> }> {
  console.error('  Downloading MCP stable CSV...');
  const mcpZip = await fetchBytes(mcpStableUrl);
  const fieldsCsv = extractFromZip(mcpZip, 'fields.csv');
  const methodsCsv = extractFromZip(mcpZip, 'methods.csv');
  return { csvFields: parseMcpCsv(fieldsCsv), csvMethods: parseMcpCsv(methodsCsv) };
}

/**
 * Build obf_class -> deobf_class lookup from parsed mapping data.
 *
 * Accepts both SRG fields (keyed by srg_name) and TSRGv1 fields (keyed by `${obf_class}\0${mojang_name}`).
 */
function buildClassMap(
  methods: Map<string, { obf_class: string; deobf_class: string }>,
  fields: Map<string, { obf_class: string; deobf_class: string }>
): Map<string, string> {
  const classMap = new Map<string, string>();

  for (const info of methods.values()) {
    if (info.obf_class && info.deobf_class) {
      classMap.set(info.obf_class, info.deobf_class);
    }
  }

  for (const [key, info] of fields.entries()) {
    if (info.obf_class) {
      if (key.includes('\0')) {
        // TSRGv1 fields: key = `${obf_class}\0${mojang_name}`
        if (info.deobf_class) {
          classMap.set(info.obf_class, info.deobf_class);
        }
      } else if (info.deobf_class) {
        // SRG fields: key = srg_name
        classMap.set(info.obf_class, info.deobf_class);
      }
    }
  }

  return classMap;
}

/**
 * Build obf_class -> deobf_class lookup from already-merged MappingEntry array.
 * Used when class names come from ProGuard (not raw parser output).
 */
export function buildClassMapFromEntries(entries: MappingEntry[]): Map<string, string> {
  const classMap = new Map<string, string>();
  for (const entry of entries) {
    if (entry.obf_class && entry.deobf_class) {
      classMap.set(entry.obf_class, entry.deobf_class);
    }
  }
  return classMap;
}

/**
 * Merge CSV method entries with SRG/TSRG method mappings.
 */
function mergeCsvMethods(
  csvMethods: ReturnType<typeof parseMcpCsv>,
  mappingMethods: Map<string, { obf_class: string; deobf_class: string; obf_name: string; descriptor: string }>,
  staticMethods: Set<string>
): MappingEntry[] {
  const entries: MappingEntry[] = [];

  for (const csvMethod of csvMethods) {
    const srgName = csvMethod.searge;
    const deobfName = csvMethod.name;
    const sideonly = SIDE_MAP[csvMethod.side] ?? 'common';
    const info = mappingMethods.get(srgName);

    if (info) {
      entries.push(makeEntry({
        type: 'method',
        obf_class: info.obf_class,
        deobf_class: info.deobf_class,
        obf_name: info.obf_name,
        deobf_name: deobfName,
        srg_name: srgName,
        obf_desc: info.descriptor,
        is_static: checkStatic(srgName, staticMethods),
        sideonly,
      }));
    } else {
      entries.push(makeEntry({
        type: 'method',
        deobf_name: deobfName,
        srg_name: srgName,
        sideonly,
      }));
    }
  }

  return entries;
}

/**
 * Merge CSV field entries with SRG field mappings (legacy_srg workflow).
 */
function mergeCsvFieldsSrg(
  csvFields: ReturnType<typeof parseMcpCsv>,
  srgFields: Map<string, { obf_class: string; obf_name: string; deobf_class: string }>
): MappingEntry[] {
  const entries: MappingEntry[] = [];

  for (const csvField of csvFields) {
    const srgName = csvField.searge;
    const deobfName = csvField.name;
    const sideonly = SIDE_MAP[csvField.side] ?? 'common';
    const info = srgFields.get(srgName);

    if (info) {
      entries.push(makeEntry({
        type: 'field',
        obf_class: info.obf_class,
        deobf_class: info.deobf_class,
        obf_name: info.obf_name,
        deobf_name: deobfName,
        srg_name: srgName,
        sideonly,
      }));
    } else {
      entries.push(makeEntry({
        type: 'field',
        deobf_name: deobfName,
        srg_name: srgName,
        sideonly,
      }));
    }
  }

  return entries;
}

/**
 * Merge CSV field entries with TSRGv1 field mappings (legacy workflow).
 *
 * TSRGv1 fields are keyed by `${obf_class}\0${second_column}` where second_column is:
 *   - An SRG name (field_xxxx) for most fields
 *   - A Mojang name (camelCase) for officially mapped fields
 *
 * Matching strategy:
 *   1. For SRG-named TSRG entries: match CSV searge == TSRG second column
 *   2. For Mojang-named TSRG entries: match CSV name == TSRG second column
 */
function mergeCsvFieldsTsrg(
  csvFields: ReturnType<typeof parseMcpCsv>,
  tsrgFields: Map<string, { obf_class: string; obf_name: string; deobf_class: string }>
): MappingEntry[] {
  // Build SRG and Mojang name lookups in a single pass
  const srgLookup = new Map<string, { obf_class: string; tsrg_info: { obf_class: string; obf_name: string; deobf_class: string } }>();
  const mojangLookup = new Map<string, { obf_class: string; tsrg_info: { obf_class: string; obf_name: string; deobf_class: string } }>();
  for (const [key, tsrg_info] of tsrgFields.entries()) {
    const [_obfClass, col2] = key.split('\0');
    if (col2.startsWith('field_')) {
      srgLookup.set(col2, { obf_class: _obfClass, tsrg_info });
    } else {
      mojangLookup.set(col2, { obf_class: _obfClass, tsrg_info });
    }
  }

  const entries: MappingEntry[] = [];

  for (const csvField of csvFields) {
    const srgName = csvField.searge;
    const deobfName = csvField.name;
    const sideonly = SIDE_MAP[csvField.side] ?? 'common';

    // Try SRG name match first
    const srgMatch = srgLookup.get(srgName);
    if (srgMatch) {
      entries.push(makeEntry({
        type: 'field',
        obf_class: srgMatch.tsrg_info.obf_class,
        deobf_class: srgMatch.tsrg_info.deobf_class,
        obf_name: srgMatch.tsrg_info.obf_name,
        deobf_name: deobfName,
        srg_name: srgName,
        sideonly,
      }));
      continue;
    }

    // Try Mojang name match
    const mojangMatch = mojangLookup.get(deobfName);
    if (mojangMatch) {
      entries.push(makeEntry({
        type: 'field',
        obf_class: mojangMatch.tsrg_info.obf_class,
        deobf_class: mojangMatch.tsrg_info.deobf_class,
        obf_name: mojangMatch.tsrg_info.obf_name,
        deobf_name: deobfName,
        srg_name: srgName,
        sideonly,
      }));
      continue;
    }

    // No match
    entries.push(makeEntry({
      type: 'field',
      deobf_name: deobfName,
      srg_name: srgName,
      sideonly,
    }));
  }

  return entries;
}

/**
 * Build MappingEntry list for constructors, using class_map for obf_class lookup.
 */
function addConstructorEntries(
  constructors: { srg_id: string; class_path: string; descriptor: string }[],
  classMap: Map<string, string>
): MappingEntry[] {
  // Build reverse map: deobf → obf
  const reverseMap = new Map<string, string>();
  for (const [obf, deobf] of classMap.entries()) {
    reverseMap.set(deobf, obf);
  }

  return constructors.map((ctor) => makeEntry({
    type: 'method',
    obf_class: reverseMap.get(ctor.class_path) ?? '',
    deobf_class: ctor.class_path,
    obf_name: '<init>',
    deobf_name: '<init>',
    srg_name: '<init>',
    obf_desc: ctor.descriptor,
  }));
}

// ============================================================================
// Workflow: legacy_srg (1.7.10 - 1.11.2)
// ============================================================================

/**
 * Build merged mapping table for MC 1.7.10 - 1.11.2.
 * Uses SRG + MCP stable CSV + static_methods.txt
 */
export async function buildLegacySrg(mcVersion: string, config: VersionConfig): Promise<MappingEntry[]> {
  console.error('');
  console.error(`=== Building cache for MC ${mcVersion} (legacy SRG workflow) ===`);

  // Step 1: Download and parse SRG
  console.error('');
  console.error('[1/3] Downloading SRG mappings...');
  const srgZip = await fetchBytes(requireUrl(config.srg_url, 'srg_url', 'legacy_srg', mcVersion));
  const srgContent = extractFromZip(srgZip, 'joined.srg');
  const staticContent = extractOptionalFromZip(srgZip, 'static_methods.txt', 'static_methods.txt');

  const { methods: srgMethods, fields: srgFields } = parseSrg(srgContent);
  const staticMethods = staticContent ? parseStaticMethods(staticContent) : new Set<string>();

  // Step 2: Download and parse MCP CSV
  console.error('[2/3] Downloading MCP stable CSV...');
  const { csvFields, csvMethods } = await fetchMcpCsvPair(requireUrl(config.mcp_stable_url, 'mcp_stable_url', 'legacy_srg', mcVersion));

  // Step 3: Merge
  console.error('[3/3] Merging data...');
  const entries = mergeCsvMethods(csvMethods, srgMethods, staticMethods);
  entries.push(...mergeCsvFieldsSrg(csvFields, srgFields));

  const classMap = buildClassMap(srgMethods, srgFields);
  computeDeobfDesc(entries, classMap);

  return entries;
}

// ============================================================================
// Workflow: legacy (1.12.2 - 1.15.2)
// ============================================================================

/**
 * Build merged mapping table for MC 1.12.2 - 1.15.2.
 * Uses TSRGv1 + MCP stable CSV + static_methods.txt + constructors
 */
export async function buildLegacy(mcVersion: string, config: VersionConfig): Promise<MappingEntry[]> {
  console.error('');
  console.error(`=== Building cache for MC ${mcVersion} (legacy workflow) ===`);

  // Step 1: Download and parse TSRG
  console.error('');
  console.error('[1/3] Downloading MCPConfig TSRG...');
  const tsrgZip = await fetchBytes(requireUrl(config.tsrg_url, 'tsrg_url', 'legacy', mcVersion));
  const tsrgContent = extractFromZip(tsrgZip, 'config/joined.tsrg');
  const staticContent = extractOptionalFromZip(tsrgZip, 'config/static_methods.txt', 'static_methods.txt');
  const ctorContent = extractOptionalFromZip(tsrgZip, 'config/constructors', 'constructors file');

  const { methods: tsrgMethods, fields: tsrgFields } = parseTsrgv1(tsrgContent);
  const staticMethods = staticContent ? parseStaticMethods(staticContent) : new Set<string>();
  const constructors = ctorContent ? parseConstructors(ctorContent) : [];

  // Step 2: Download and parse MCP CSV
  console.error('[2/3] Downloading MCP stable CSV...');
  const { csvFields, csvMethods } = await fetchMcpCsvPair(requireUrl(config.mcp_stable_url, 'mcp_stable_url', 'legacy', mcVersion));

  // Step 3: Merge
  console.error('[3/3] Merging data...');
  const entries = mergeCsvMethods(csvMethods, tsrgMethods, staticMethods);
  entries.push(...mergeCsvFieldsTsrg(csvFields, tsrgFields));

  // Add constructor entries using class_map for efficient lookup
  const classMap = buildClassMap(tsrgMethods, tsrgFields);
  entries.push(...addConstructorEntries(constructors, classMap));
  computeDeobfDesc(entries, classMap);

  return entries;
}

// ============================================================================
// Workflow: legacy_proguard (1.16.x)
// ============================================================================

/**
 * Build merged mapping table for MC 1.16.x.
 * Uses TSRGv1 + Mojang ProGuard (MCP was abandoned).
 *
 * Join key: obf_class + obf_name
 */
export async function buildLegacyProguard(mcVersion: string, config: VersionConfig): Promise<MappingEntry[]> {
  console.error('');
  console.error(`=== Building cache for MC ${mcVersion} (legacy TSRGv1 + ProGuard) ===`);

  // Step 1: Download and parse TSRG
  console.error('');
  console.error('[1/3] Downloading MCPConfig TSRG...');
  const tsrgZip = await fetchBytes(requireUrl(config.tsrg_url, 'tsrg_url', 'legacy_proguard', mcVersion));
  const tsrgContent = extractFromZip(tsrgZip, 'config/joined.tsrg');
  const staticContent = extractOptionalFromZip(tsrgZip, 'config/static_methods.txt', 'static_methods.txt');

  const { methods: tsrgMethods, fields: tsrgFields } = parseTsrgv1(tsrgContent);
  const staticMethods = staticContent ? parseStaticMethods(staticContent) : new Set<string>();

  // Step 2: Download and parse ProGuard
  console.error('[2/3] Downloading Mojang ProGuard mappings...');
  const proguardContent = await fetchText(requireUrl(config.proguard_url, 'proguard_url', 'legacy_proguard', mcVersion));
  const proguardEntries = parseProguard(proguardContent);

  // Step 3: Merge
  console.error('[3/3] Merging data...');

  // Build ProGuard lookup: `${obf_class}\0${obf_name}\0${type}` -> entry
  const proguardMap = new Map<string, (typeof proguardEntries)[number]>();
  for (const entry of proguardEntries) {
    const key = `${entry.obf_class}\0${entry.obf_name}\0${entry.type}`;
    proguardMap.set(key, entry);
  }

  const entries: MappingEntry[] = [];

  // Merge methods from TSRG with ProGuard
  for (const [srgName, tsrgInfo] of tsrgMethods.entries()) {
    const obfClass = tsrgInfo.obf_class;
    const obfName = tsrgInfo.obf_name;
    const proguardKey = `${obfClass}\0${obfName}\0method`;
    const proguardMatch = proguardMap.get(proguardKey);

    if (proguardMatch) {
      entries.push(makeEntry({
        type: 'method',
        obf_class: obfClass,
        deobf_class: proguardMatch.deobf_class,
        obf_name: obfName,
        deobf_name: proguardMatch.deobf_name,
        srg_name: srgName,
        obf_desc: tsrgInfo.descriptor,
        is_static: checkStatic(srgName, staticMethods),
      }));
    } else {
      entries.push(makeEntry({
        type: 'method',
        obf_class: obfClass,
        deobf_class: tsrgInfo.deobf_class,
        obf_name: obfName,
        deobf_name: srgName,
        srg_name: srgName,
        obf_desc: tsrgInfo.descriptor,
        is_static: checkStatic(srgName, staticMethods),
      }));
    }
  }

  // Merge fields from TSRG with ProGuard
  for (const [key, tsrgInfo] of tsrgFields.entries()) {
    const [obfClass, col2] = key.split('\0');
    const obfName = tsrgInfo.obf_name;
    const proguardKey = `${obfClass}\0${obfName}\0field`;
    const proguardMatch = proguardMap.get(proguardKey);
    // col2 is SRG name (field_xxxx) or Mojang name
    const srgName = col2.startsWith('field_') ? col2 : '';

    if (proguardMatch) {
      entries.push(makeEntry({
        type: 'field',
        obf_class: obfClass,
        deobf_class: proguardMatch.deobf_class,
        obf_name: obfName,
        deobf_name: proguardMatch.deobf_name,
        srg_name: srgName,
      }));
    } else {
      entries.push(makeEntry({
        type: 'field',
        obf_class: obfClass,
        obf_name: obfName,
        deobf_name: col2,
        srg_name: srgName,
      }));
    }
  }

  const classMap = buildClassMapFromEntries(entries);
  computeDeobfDesc(entries, classMap);

  return entries;
}

// ============================================================================
// Workflow: modern (1.17+)
// ============================================================================

/**
 * Build merged mapping table for MC 1.17+.
 * Uses TSRGv2 + Mojang ProGuard
 */
export async function buildModern(mcVersion: string, config: VersionConfig): Promise<MappingEntry[]> {
  console.error('');
  console.error(`=== Building cache for MC ${mcVersion} (modern workflow) ===`);

  // Step 1: Download and parse TSRG
  console.error('');
  console.error('[1/3] Downloading MCPConfig TSRG...');
  const tsrgZip = await fetchBytes(requireUrl(config.tsrg_url, 'tsrg_url', 'modern', mcVersion));
  const tsrgContent = extractFromZip(tsrgZip, 'config/joined.tsrg');

  // Step 2: Download and parse ProGuard
  console.error('[2/3] Downloading Mojang ProGuard mappings...');
  const proguardContent = await fetchText(requireUrl(config.proguard_url, 'proguard_url', 'modern', mcVersion));

  const tsrgEntries = parseTsrgv2(tsrgContent);
  const proguardEntries = parseProguard(proguardContent);

  // Step 3: Merge
  console.error('[3/3] Merging data...');

  // Build lookup maps: `${obf_class}\0${obf_name}\0${type}` -> entry
  const tsrgMap = new Map<string, (typeof tsrgEntries)[number]>();
  for (const entry of tsrgEntries) {
    const key = `${entry.obf_class}\0${entry.obf_name}\0${entry.type}`;
    tsrgMap.set(key, entry);
  }

  const proguardMap = new Map<string, (typeof proguardEntries)[number]>();
  for (const entry of proguardEntries) {
    const key = `${entry.obf_class}\0${entry.obf_name}\0${entry.type}`;
    proguardMap.set(key, entry);
  }

  const entries: MappingEntry[] = [];

  // Start with all TSRG entries and join with ProGuard
  for (const [tsrgKey, tsrgEntry] of tsrgMap.entries()) {
    const proguardMatch = proguardMap.get(tsrgKey);

    if (proguardMatch) {
      entries.push(makeEntry({
        type: tsrgEntry.type,
        obf_class: tsrgEntry.obf_class,
        deobf_class: proguardMatch.deobf_class,
        obf_name: tsrgEntry.obf_name,
        deobf_name: proguardMatch.deobf_name,
        srg_name: tsrgEntry.srg_name,
        obf_desc: tsrgEntry.descriptor,
        is_static: tsrgEntry.is_static,
      }));
    } else {
      entries.push(makeEntry({
        type: tsrgEntry.type,
        obf_class: tsrgEntry.obf_class,
        obf_name: tsrgEntry.obf_name,
        srg_name: tsrgEntry.srg_name,
        obf_desc: tsrgEntry.descriptor,
        is_static: tsrgEntry.is_static,
      }));
    }
  }

  // Add ProGuard entries that have no TSRG match
  for (const [proguardKey, proguardEntry] of proguardMap.entries()) {
    if (!tsrgMap.has(proguardKey)) {
      entries.push(makeEntry({
        type: proguardEntry.type,
        obf_class: proguardEntry.obf_class,
        deobf_class: proguardEntry.deobf_class,
        obf_name: proguardEntry.obf_name,
        deobf_name: proguardEntry.deobf_name,
        obf_desc: proguardEntry.descriptor,
      }));
    }
  }

  const classMap = buildClassMapFromEntries(entries);
  computeDeobfDesc(entries, classMap);

  return entries;
}
