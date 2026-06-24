import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { VERSION_TABLE } from '../version-table.js';
import { buildLegacySrg, buildLegacy, buildLegacyProguard, buildModern } from './workflows.js';
import { writeCache } from './cache.js';
import { CACHE_DIR } from '../util.js';

/**
 * Build mapping cache for a given MC version.
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
  let entries;

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

  writeCache(entries, mcVersion, resolvedCacheDir);
}
