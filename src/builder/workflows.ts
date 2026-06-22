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

/**
 * Check if a method is static by looking up its SRG name.
 */
function checkStatic(srgName: string, staticMethods: Set<string>): boolean {
  return staticMethods.has(srgName.replace(/_+$/, ''));
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
  fields: Map<string, { obf_class: string; deobf_class?: string }>
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
        const obfClass = key.split('\0')[0];
        classMap.set(info.obf_class, obfClass);
      } else if (info.deobf_class) {
        // SRG fields: key = srg_name
        classMap.set(info.obf_class, info.deobf_class);
      }
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
    const sideonly = (SIDE_MAP[csvMethod.side] ?? 'common') as MappingEntry['sideonly'];
    const info = mappingMethods.get(srgName);

    if (info) {
      entries.push({
        obf_class: info.obf_class,
        deobf_class: info.deobf_class,
        type: 'method',
        obf_name: info.obf_name,
        deobf_name: deobfName,
        srg_name: srgName,
        desc: info.descriptor,
        is_static: checkStatic(srgName, staticMethods),
        sideonly,
      });
    } else {
      entries.push({
        obf_class: '',
        deobf_class: '',
        type: 'method',
        obf_name: '',
        deobf_name: deobfName,
        srg_name: srgName,
        desc: '',
        is_static: false,
        sideonly,
      });
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
    const sideonly = (SIDE_MAP[csvField.side] ?? 'common') as MappingEntry['sideonly'];
    const info = srgFields.get(srgName);

    if (info) {
      entries.push({
        obf_class: info.obf_class,
        deobf_class: info.deobf_class,
        type: 'field',
        obf_name: info.obf_name,
        deobf_name: deobfName,
        srg_name: srgName,
        desc: '',
        is_static: false,
        sideonly,
      });
    } else {
      entries.push({
        obf_class: '',
        deobf_class: '',
        type: 'field',
        obf_name: '',
        deobf_name: deobfName,
        srg_name: srgName,
        desc: '',
        is_static: false,
        sideonly,
      });
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
  tsrgFields: Map<string, { obf_class: string; obf_name: string }>
): MappingEntry[] {
  // Build SRG name lookup: srg_name -> { obf_class, tsrg_info }
  const srgLookup = new Map<string, { obf_class: string; tsrg_info: { obf_class: string; obf_name: string } }>();
  for (const [key, tsrg_info] of tsrgFields.entries()) {
    const [_obfClass, col2] = key.split('\0');
    if (col2.startsWith('field_')) {
      srgLookup.set(col2, { obf_class: _obfClass, tsrg_info });
    }
  }

  // Build Mojang name lookup: mojang_name -> { obf_class, tsrg_info }
  const mojangLookup = new Map<string, { obf_class: string; tsrg_info: { obf_class: string; obf_name: string } }>();
  for (const [key, tsrg_info] of tsrgFields.entries()) {
    const [_obfClass, col2] = key.split('\0');
    if (!col2.startsWith('field_')) {
      mojangLookup.set(col2, { obf_class: _obfClass, tsrg_info });
    }
  }

  const entries: MappingEntry[] = [];

  for (const csvField of csvFields) {
    const srgName = csvField.searge;
    const deobfName = csvField.name;
    const sideonly = (SIDE_MAP[csvField.side] ?? 'common') as MappingEntry['sideonly'];

    // Try SRG name match first
    const srgMatch = srgLookup.get(srgName);
    if (srgMatch) {
      entries.push({
        obf_class: srgMatch.tsrg_info.obf_class,
        deobf_class: srgMatch.obf_class,
        type: 'field',
        obf_name: srgMatch.tsrg_info.obf_name,
        deobf_name: deobfName,
        srg_name: srgName,
        desc: '',
        is_static: false,
        sideonly,
      });
      continue;
    }

    // Try Mojang name match
    const mojangMatch = mojangLookup.get(deobfName);
    if (mojangMatch) {
      entries.push({
        obf_class: mojangMatch.tsrg_info.obf_class,
        deobf_class: mojangMatch.obf_class,
        type: 'field',
        obf_name: mojangMatch.tsrg_info.obf_name,
        deobf_name: deobfName,
        srg_name: srgName,
        desc: '',
        is_static: false,
        sideonly,
      });
      continue;
    }

    // No match
    entries.push({
      obf_class: '',
      deobf_class: '',
      type: 'field',
      obf_name: '',
      deobf_name: deobfName,
      srg_name: srgName,
      desc: '',
      is_static: false,
      sideonly,
    });
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
  return constructors.map((ctor) => ({
    obf_class: classMap.get(ctor.class_path) ?? '',
    deobf_class: ctor.class_path,
    type: 'method' as const,
    obf_name: '<init>',
    deobf_name: '<init>',
    srg_name: '<init>',
    desc: ctor.descriptor,
    is_static: false,
    sideonly: 'common' as const,
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
  const srgZip = await fetchBytes(config.srg_url!);
  const srgContent = extractFromZip(srgZip, 'joined.srg');
  const staticContent = extractOptionalFromZip(srgZip, 'static_methods.txt', 'static_methods.txt');

  const { methods: srgMethods, fields: srgFields } = parseSrg(srgContent);
  const staticMethods = staticContent ? parseStaticMethods(staticContent) : new Set<string>();

  // Step 2: Download and parse MCP CSV
  console.error('[2/3] Downloading MCP stable CSV...');
  const { csvFields, csvMethods } = await fetchMcpCsvPair(config.mcp_stable_url!);

  // Step 3: Merge
  console.error('[3/3] Merging data...');
  const entries = mergeCsvMethods(csvMethods, srgMethods, staticMethods);
  entries.push(...mergeCsvFieldsSrg(csvFields, srgFields));

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
  const tsrgZip = await fetchBytes(config.tsrg_url!);
  const tsrgContent = extractFromZip(tsrgZip, 'config/joined.tsrg');
  const staticContent = extractOptionalFromZip(tsrgZip, 'config/static_methods.txt', 'static_methods.txt');
  const ctorContent = extractOptionalFromZip(tsrgZip, 'config/constructors', 'constructors file');

  const { methods: tsrgMethods, fields: tsrgFields } = parseTsrgv1(tsrgContent);
  const staticMethods = staticContent ? parseStaticMethods(staticContent) : new Set<string>();
  const constructors = ctorContent ? parseConstructors(ctorContent) : [];

  // Step 2: Download and parse MCP CSV
  console.error('[2/3] Downloading MCP stable CSV...');
  const { csvFields, csvMethods } = await fetchMcpCsvPair(config.mcp_stable_url!);

  // Step 3: Merge
  console.error('[3/3] Merging data...');
  const entries = mergeCsvMethods(csvMethods, tsrgMethods, staticMethods);
  entries.push(...mergeCsvFieldsTsrg(csvFields, tsrgFields));

  // Add constructor entries using class_map for efficient lookup
  const classMap = buildClassMap(tsrgMethods, tsrgFields);
  entries.push(...addConstructorEntries(constructors, classMap));

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
  const tsrgZip = await fetchBytes(config.tsrg_url!);
  const tsrgContent = extractFromZip(tsrgZip, 'config/joined.tsrg');
  const staticContent = extractOptionalFromZip(tsrgZip, 'config/static_methods.txt', 'static_methods.txt');

  const { methods: tsrgMethods, fields: tsrgFields } = parseTsrgv1(tsrgContent);
  const staticMethods = staticContent ? parseStaticMethods(staticContent) : new Set<string>();

  // Step 2: Download and parse ProGuard
  console.error('[2/3] Downloading Mojang ProGuard mappings...');
  const proguardContent = await fetchText(config.proguard_url!);
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
      entries.push({
        obf_class: obfClass,
        deobf_class: proguardMatch.deobf_class,
        type: 'method',
        obf_name: obfName,
        deobf_name: proguardMatch.deobf_name,
        srg_name: srgName,
        desc: tsrgInfo.descriptor,
        is_static: checkStatic(srgName, staticMethods),
        sideonly: 'common',
      });
    } else {
      entries.push({
        obf_class: obfClass,
        deobf_class: tsrgInfo.deobf_class,
        type: 'method',
        obf_name: obfName,
        deobf_name: srgName,
        srg_name: srgName,
        desc: tsrgInfo.descriptor,
        is_static: checkStatic(srgName, staticMethods),
        sideonly: 'common',
      });
    }
  }

  // Merge fields from TSRG with ProGuard
  for (const [key, tsrgInfo] of tsrgFields.entries()) {
    const [obfClass, mojangName] = key.split('\0');
    const obfName = tsrgInfo.obf_name;
    const proguardKey = `${obfClass}\0${obfName}\0field`;
    const proguardMatch = proguardMap.get(proguardKey);

    if (proguardMatch) {
      entries.push({
        obf_class: obfClass,
        deobf_class: proguardMatch.deobf_class,
        type: 'field',
        obf_name: obfName,
        deobf_name: proguardMatch.deobf_name,
        srg_name: '',
        desc: '',
        is_static: false,
        sideonly: 'common',
      });
    } else {
      entries.push({
        obf_class: obfClass,
        deobf_class: obfClass,
        type: 'field',
        obf_name: obfName,
        deobf_name: mojangName,
        srg_name: '',
        desc: '',
        is_static: false,
        sideonly: 'common',
      });
    }
  }

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
  const tsrgZip = await fetchBytes(config.tsrg_url!);
  const tsrgContent = extractFromZip(tsrgZip, 'config/joined.tsrg');

  // Step 2: Download and parse ProGuard
  console.error('[2/3] Downloading Mojang ProGuard mappings...');
  const proguardContent = await fetchText(config.proguard_url!);

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
      entries.push({
        obf_class: tsrgEntry.obf_class,
        deobf_class: proguardMatch.deobf_class,
        type: tsrgEntry.type,
        obf_name: tsrgEntry.obf_name,
        deobf_name: proguardMatch.deobf_name,
        srg_name: tsrgEntry.srg_name,
        desc: tsrgEntry.descriptor,
        is_static: tsrgEntry.is_static,
        sideonly: 'common',
      });
    } else {
      entries.push({
        obf_class: tsrgEntry.obf_class,
        deobf_class: '',
        type: tsrgEntry.type,
        obf_name: tsrgEntry.obf_name,
        deobf_name: '',
        srg_name: tsrgEntry.srg_name,
        desc: tsrgEntry.descriptor,
        is_static: tsrgEntry.is_static,
        sideonly: 'common',
      });
    }
  }

  // Add ProGuard entries that have no TSRG match
  for (const [proguardKey, proguardEntry] of proguardMap.entries()) {
    if (!tsrgMap.has(proguardKey)) {
      entries.push({
        obf_class: proguardEntry.obf_class,
        deobf_class: proguardEntry.deobf_class,
        type: proguardEntry.type,
        obf_name: proguardEntry.obf_name,
        deobf_name: proguardEntry.deobf_name,
        srg_name: '',
        desc: proguardEntry.descriptor,
        is_static: false,
        sideonly: 'common',
      });
    }
  }

  return entries;
}
