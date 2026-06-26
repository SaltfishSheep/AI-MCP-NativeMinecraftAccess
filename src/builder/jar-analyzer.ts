import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { JavaClassFileReader, ConstantType } from 'java-class-tools';
import type { JavaClassFile, Utf8Info, ClassInfo } from 'java-class-tools';
import type { MappingEntry } from '../types.js';
import { fetchBytes } from './download.js';
import { CACHE_DIR } from '../util.js';

// ============================================================================
// Constants
// ============================================================================

/** JVM access flag constants (JVM Spec §4.1, §4.5, §4.6) */
const ACC_PUBLIC    = 0x0001;
const ACC_PRIVATE   = 0x0002;
const ACC_PROTECTED = 0x0004;
const ACC_STATIC    = 0x0008;

/** Directory for temporary JAR file caching during build */
const JAR_CACHE_DIR = join(CACHE_DIR, '.jar-cache');

/** Mojang version manifest URL */
const VERSION_MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';

// ============================================================================
// Types
// ============================================================================

export interface JarMemberInfo {
  access: MappingEntry['access'];
  is_static: MappingEntry['is_static'];
  sideonly: MappingEntry['sideonly'];
  /** JVM descriptor: type descriptor for fields (e.g. "I", "Ljava/lang/String;"), method descriptor for methods */
  desc: string;
}

// ============================================================================
// JVM Constant Pool Helpers
// ============================================================================

function resolveUtf8(cp: JavaClassFile['constant_pool'], index: number): string {
  if (index === 0 || index >= cp.length) return '';
  const entry = cp[index];
  if (!entry || entry.tag !== ConstantType.UTF8) return '';
  return Buffer.from((entry as Utf8Info).bytes).toString('utf-8');
}

function resolveClassName(cp: JavaClassFile['constant_pool'], index: number): string {
  if (index === 0 || index >= cp.length) return '';
  const entry = cp[index];
  if (!entry || entry.tag !== ConstantType.CLASS) return '';
  return resolveUtf8(cp, (entry as ClassInfo).name_index);
}

/** Extract visibility from JVM access flags */
function getVisibility(flags: number): MappingEntry['access'] {
  if (flags & ACC_PUBLIC)    return 'public';
  if (flags & ACC_PRIVATE)   return 'private';
  if (flags & ACC_PROTECTED) return 'protected';
  return 'default';
}

// ============================================================================
// .class File Parsing
// ============================================================================

interface ClassMember {
  type: 'field' | 'method';
  className: string;
  name: string;
  desc: string;
  access: MappingEntry['access'];
  isStatic: boolean;
}

function parseClassFile(buffer: Buffer): ClassMember[] {
  const reader = new JavaClassFileReader();
  const cf = reader.read(buffer);
  const cp = cf.constant_pool;
  const className = resolveClassName(cp, cf.this_class);
  const members: ClassMember[] = [];

  for (const field of cf.fields) {
    members.push({
      type: 'field',
      className,
      name: resolveUtf8(cp, field.name_index),
      desc: resolveUtf8(cp, field.descriptor_index),
      access: getVisibility(field.access_flags),
      isStatic: !!(field.access_flags & ACC_STATIC),
    });
  }

  for (const method of cf.methods) {
    members.push({
      type: 'method',
      className,
      name: resolveUtf8(cp, method.name_index),
      desc: resolveUtf8(cp, method.descriptor_index),
      access: getVisibility(method.access_flags),
      isStatic: !!(method.access_flags & ACC_STATIC),
    });
  }

  return members;
}

// ============================================================================
// JAR Handling (with Mojang Bundler support)
// ============================================================================

/**
 * Unwrap Mojang bundler format (server.jar for 1.18+).
 * The bundler wraps the actual server JAR inside META-INF/versions/.
 */
async function unwrapBundler(jarBuffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(jarBuffer);

  const versionsListEntry = zip.file('META-INF/versions.list');
  if (versionsListEntry) {
    const versionsList = await versionsListEntry.async('string');
    const lines = versionsList.trim().split('\n');
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const innerJarPath = `META-INF/versions/${parts[2]}`;
        const innerEntry = zip.file(innerJarPath);
        if (innerEntry) {
          return innerEntry.async('nodebuffer') as Promise<Buffer>;
        }
      }
    }
  }

  // Fallback: scan for version JARs
  const versionJars = Object.keys(zip.files).filter(
    (name) => name.startsWith('META-INF/versions/') && name.endsWith('.jar')
  );
  if (versionJars.length > 0) {
    const entry = zip.file(versionJars[0]);
    if (entry) {
      return entry.async('nodebuffer') as Promise<Buffer>;
    }
  }

  return jarBuffer;
}

/**
 * Parse all .class files in a JAR buffer.
 *
 * Returns TWO lookup maps:
 *   - fieldMap:  keyed by `obf_class\x00obf_name` (2-part, for field matching)
 *   - methodMap: keyed by `obf_class\x00obf_name\x00obf_desc` (3-part, for method matching)
 */
async function parseJar(jarBuffer: Buffer): Promise<{
  fieldMap: Map<string, JarMemberInfo>;
  methodMap: Map<string, JarMemberInfo>;
}> {
  const actualBuffer = await unwrapBundler(jarBuffer);
  const zip = await JSZip.loadAsync(actualBuffer);

  const classFiles = Object.keys(zip.files).filter(
    (name) => name.endsWith('.class') && !zip.files[name].dir
  );

  const fieldMap = new Map<string, JarMemberInfo>();
  const methodMap = new Map<string, JarMemberInfo>();

  for (const classPath of classFiles) {
    try {
      const buffer = await zip.files[classPath].async('nodebuffer') as Buffer;
      const members = parseClassFile(buffer);

      for (const m of members) {
        const info: JarMemberInfo = {
          access: m.access,
          is_static: m.isStatic ? 'static' : 'non-static',
          sideonly: 'common', // placeholder, overwritten during merge
          desc: m.desc,
        };

        if (m.type === 'field') {
          // Field key: obf_class + obf_name (2-part)
          const key = `${m.className}\x00${m.name}`;
          if (!fieldMap.has(key)) {
            fieldMap.set(key, info);
          }
        } else {
          // Method key: obf_class + obf_name + obf_desc (3-part)
          const key = `${m.className}\x00${m.name}\x00${m.desc}`;
          if (!methodMap.has(key)) {
            methodMap.set(key, info);
          }
        }
      }
    } catch {
      // Skip unparseable classes
    }
  }

  return { fieldMap, methodMap };
}

// ============================================================================
// Mojang Version Manifest
// ============================================================================

async function fetchJarUrls(mcVersion: string): Promise<{ clientUrl: string; serverUrl: string }> {
  const manifestBytes = await fetchBytes(VERSION_MANIFEST_URL);
  const manifest = JSON.parse(manifestBytes.toString('utf-8')) as {
    versions: Array<{ id: string; url: string }>;
  };

  const versionEntry = manifest.versions.find((v) => v.id === mcVersion);
  if (!versionEntry) {
    throw new Error(`Version "${mcVersion}" not found in Mojang version manifest`);
  }

  const versionInfoBytes = await fetchBytes(versionEntry.url);
  const versionInfo = JSON.parse(versionInfoBytes.toString('utf-8')) as {
    downloads?: { client?: { url: string }; server?: { url: string } };
  };

  const clientUrl = versionInfo.downloads?.client?.url;
  const serverUrl = versionInfo.downloads?.server?.url;
  if (!clientUrl) throw new Error(`Client JAR download URL not found for MC ${mcVersion}`);
  if (!serverUrl) throw new Error(`Server JAR download URL not found for MC ${mcVersion}`);

  return { clientUrl, serverUrl };
}

// ============================================================================
// JAR Download with Disk Caching
// ============================================================================

async function downloadJarToDisk(url: string, destPath: string): Promise<void> {
  if (existsSync(destPath)) {
    console.error(`  Using cached: ${destPath}`);
    return;
  }

  console.error(`  Downloading: ${url}`);
  const buffer = await fetchBytes(url);
  writeFileSync(destPath, buffer);
  console.error(`  Saved: (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
}

// ============================================================================
// Side-only Derivation (client vs server JAR diff)
// ============================================================================

/**
 * Derive sideonly for a single member type map by diffing client and server.
 * Keeps ALL entries from both sides (union), marks sideonly accordingly.
 */
function deriveSideonlyForMap(
  clientMap: Map<string, JarMemberInfo>,
  serverMap: Map<string, JarMemberInfo>
): Map<string, JarMemberInfo> {
  const result = new Map<string, JarMemberInfo>();
  const allKeys = new Set<string>([...clientMap.keys(), ...serverMap.keys()]);

  for (const key of allKeys) {
    const inClient = clientMap.has(key);
    const inServer = serverMap.has(key);

    let sideonly: MappingEntry['sideonly'];
    if (inClient && inServer) sideonly = 'common';
    else if (inServer) sideonly = 'server';
    else sideonly = 'client';

    const info = (inClient ? clientMap.get(key)! : serverMap.get(key)!);
    result.set(key, { ...info, sideonly });
  }

  return result;
}

// ============================================================================
// Main: Analyze JARs
// ============================================================================

export interface JarLookupResult {
  /** Field lookup: key = `obf_class\x00obf_name` */
  fieldLookup: Map<string, JarMemberInfo>;
  /** Method lookup: key = `obf_class\x00obf_name\x00obf_desc` */
  methodLookup: Map<string, JarMemberInfo>;
}

/**
 * Download and analyze client + server JARs for a Minecraft version.
 * Returns lookup maps for enriching MappingEntry data with access/is_static/sideonly.
 */
export async function analyzeJars(mcVersion: string): Promise<JarLookupResult> {
  if (!existsSync(JAR_CACHE_DIR)) {
    mkdirSync(JAR_CACHE_DIR, { recursive: true });
  }

  console.error('');
  console.error(`[JAR] Analyzing JARs for MC ${mcVersion}...`);

  // Step 1: Resolve download URLs
  console.error('  [1/4] Resolving JAR URLs from Mojang manifest...');
  const { clientUrl, serverUrl } = await fetchJarUrls(mcVersion);

  // Step 2: Download JARs (with disk caching)
  const clientJarPath = join(JAR_CACHE_DIR, `${mcVersion}-client.jar`);
  const serverJarPath = join(JAR_CACHE_DIR, `${mcVersion}-server.jar`);

  console.error('  [2/4] Downloading client JAR...');
  await downloadJarToDisk(clientUrl, clientJarPath);
  console.error('  [2/4] Downloading server JAR...');
  await downloadJarToDisk(serverUrl, serverJarPath);

  // Step 3: Parse both JARs
  console.error('  [3/4] Parsing client JAR...');
  const clientResult = await parseJar(readFileSync(clientJarPath));
  console.error(`  Client: ${clientResult.fieldMap.size} fields, ${clientResult.methodMap.size} methods`);

  console.error('  [3/4] Parsing server JAR...');
  const serverResult = await parseJar(readFileSync(serverJarPath));
  console.error(`  Server: ${serverResult.fieldMap.size} fields, ${serverResult.methodMap.size} methods`);

  // Step 4: Derive sideonly per member type
  console.error('  [4/4] Deriving sideonly from client/server diff...');
  const fieldLookup = deriveSideonlyForMap(clientResult.fieldMap, serverResult.fieldMap);
  const methodLookup = deriveSideonlyForMap(clientResult.methodMap, serverResult.methodMap);

  const common = [...fieldLookup.values(), ...methodLookup.values()].filter((v) => v.sideonly === 'common').length;
  const clientOnly = [...fieldLookup.values(), ...methodLookup.values()].filter((v) => v.sideonly === 'client').length;
  const serverOnly = [...fieldLookup.values(), ...methodLookup.values()].filter((v) => v.sideonly === 'server').length;
  console.error(`  Results: ${fieldLookup.size + methodLookup.size} total (common=${common}, client-only=${clientOnly}, server-only=${serverOnly})`);

  return { fieldLookup, methodLookup };
}

// ============================================================================
// Enrich + Filter Entries (inner join with JAR data)
// ============================================================================

/**
 * Enrich MappingEntry[] with access/is_static/sideonly from JAR analysis.
 *
 * Matching rules:
 *   - Fields: match by (obf_class, obf_name) — 2-part key
 *   - Methods: match by (obf_class, obf_name, obf_desc) — 3-part key
 *
 * Only entries with a JAR match are kept (inner join / intersection).
 * Entries without a JAR match are discarded.
 */
export function enrichAndFilterEntries(
  entries: MappingEntry[],
  jarLookup: JarLookupResult
): MappingEntry[] {
  const { fieldLookup, methodLookup } = jarLookup;
  const result: MappingEntry[] = [];

  let matchedFields = 0;
  let matchedMethods = 0;
  let droppedFields = 0;
  let droppedMethods = 0;

  for (const entry of entries) {
    let jarInfo: JarMemberInfo | undefined;

    if (entry.type === 'field') {
      // Field: match by (obf_class, obf_name)
      const key = `${entry.obf_class}\x00${entry.obf_name}`;
      jarInfo = fieldLookup.get(key);
      if (jarInfo) matchedFields++;
      else droppedFields++;
    } else {
      // Method: match by (obf_class, obf_name, obf_desc)
      const key = `${entry.obf_class}\x00${entry.obf_name}\x00${entry.obf_desc}`;
      jarInfo = methodLookup.get(key);
      if (jarInfo) matchedMethods++;
      else droppedMethods++;
    }

    if (jarInfo) {
      entry.access = jarInfo.access;
      entry.is_static = jarInfo.is_static;
      entry.sideonly = jarInfo.sideonly;
      // For fields: fill obf_desc from JAR (fields have type descriptor in JAR but not in mapping data)
      if (entry.type === 'field' && jarInfo.desc && !entry.obf_desc) {
        entry.obf_desc = jarInfo.desc;
      }
      result.push(entry);
    }
  }

  console.error(`  JAR match: fields=${matchedFields}/${matchedFields + droppedFields}, methods=${matchedMethods}/${matchedMethods + droppedMethods}`);
  if (droppedFields + droppedMethods > 0) {
    console.error(`  Dropped (no JAR match): ${droppedFields} fields, ${droppedMethods} methods`);
  }

  return result;
}

// ============================================================================
// JAR Cache Cleanup
// ============================================================================

/**
 * Remove downloaded JAR files from the cache directory.
 * Called after mapping cache has been built to free disk space.
 */
export function cleanupJarCache(): void {
  if (!existsSync(JAR_CACHE_DIR)) return;

  try {
    const files = readdirSync(JAR_CACHE_DIR);
    let cleaned = 0;
    for (const file of files) {
      if (file.endsWith('.jar')) {
        unlinkSync(join(JAR_CACHE_DIR, file));
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.error(`[JAR] Cleaned up ${cleaned} cached JAR file(s)`);
    }

    // Remove directory if empty
    try {
      const remaining = readdirSync(JAR_CACHE_DIR);
      if (remaining.length === 0) {
        rmdirSync(JAR_CACHE_DIR);
      }
    } catch {
      // ignore
    }
  } catch {
    // Ignore cleanup errors
  }
}
