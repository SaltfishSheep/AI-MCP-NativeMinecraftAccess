import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { VERSION_TABLE } from '../version-table.js';
import { buildLegacySrg, buildLegacy, buildLegacyProguard, buildModern, computeDeobfDesc, buildClassMapFromEntries } from './workflows.js';
import { writeCache } from './cache.js';
import { CACHE_DIR } from '../util.js';
import { analyzeJars, enrichAndFilterEntries, cleanupJarCache } from './jar-analyzer.js';
import type { MappingEntry } from '../types.js';

/**
 * Build mapping cache for a given MC version.
 *
 * Workflow:
 *   1. Build entries from mapping sources (SRG/TSRG/ProGuard/MCP CSV)
 *   2. Download and parse client + server JARs to extract access/is_static/sideonly
 *   3. Enrich entries with JAR data, filtering to intersection only
 *   4. Write CSV cache
 *   5. Clean up downloaded JAR files
 *
 * If JAR analysis fails, falls back to original entries (preserving existing is_static/sideonly).
 *
 * @param mcVersion Minecraft version (e.g., "1.12.2", "1.20.1")
 * @param cacheDir Directory to store cache files
 * @param force Force rebuild even if cache exists
 */
export async function buildMappingCache(
  mcVersion: string,
  cacheDir?: string,
  force?: boolean
): Promise<void> {
  const resolvedCacheDir = cacheDir ?? CACHE_DIR;
  const cachePath = join(resolvedCacheDir, `${mcVersion}.csv`);

  if (existsSync(cachePath) && !force) {
    console.error(`Cache already exists: ${cachePath}`);
    console.error('Use --force to rebuild');
    return;
  }

  // Check if version is supported
  const versionConfig = VERSION_TABLE[mcVersion];
  if (!versionConfig) {
    throw new Error(`MC version ${mcVersion} is not supported. Supported versions: ${Object.keys(VERSION_TABLE).sort().join(', ')}`);
  }

  const workflow = versionConfig.workflow;
  let entries: MappingEntry[];

  switch (workflow) {
    case 'legacy_srg':
      entries = await buildLegacySrg(mcVersion, versionConfig);
      break;
    case 'legacy':
      entries = await buildLegacy(mcVersion, versionConfig);
      break;
    case 'legacy_proguard':
      entries = await buildLegacyProguard(mcVersion, versionConfig);
      break;
    case 'modern':
      entries = await buildModern(mcVersion, versionConfig);
      break;
    default: {
      const _exhaustive: never = workflow;
      throw new Error(`Unknown workflow: ${_exhaustive}`);
    }
  }

  // Enrich entries with JAR-derived access/is_static/sideonly/obf_desc
  // On failure, fall back to original entries (preserving existing is_static/sideonly)
  try {
    const jarLookup = await analyzeJars(mcVersion);
    entries = enrichAndFilterEntries(entries, jarLookup);

    // After JAR enrichment, fields now have obf_desc (type descriptor from JAR).
    // Recompute deobf_desc for all entries using the class mapping.
    const classMap = buildClassMapFromEntries(entries);
    computeDeobfDesc(entries, classMap);
  } catch (err) {
    console.error('');
    console.error(`[WARN] JAR analysis failed for MC ${mcVersion}, using fallback data:`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    console.error(`  Entries will use mapping-source is_static/sideonly (access will be empty)`);
  } finally {
    // Always clean up JAR cache, even on failure
    cleanupJarCache();
  }

  writeCache(entries, mcVersion, resolvedCacheDir);
}
