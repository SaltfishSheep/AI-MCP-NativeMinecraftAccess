import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { VERSION_TABLE } from '../version-table.js';
import { buildLegacySrg, buildLegacy, buildLegacyProguard, buildModern } from './workflows.js';
import { writeCache } from './cache.js';
import { CACHE_DIR } from '../types.js';

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
    console.error(`[ERROR] MC version ${mcVersion} is not supported.`);
    console.error(`Supported versions: ${Object.keys(VERSION_TABLE).sort().join(', ')}`);
    return;
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
    default:
      console.error(`[ERROR] Unknown workflow: ${workflow as string}`);
      return;
  }

  writeCache(entries, mcVersion, resolvedCacheDir);
}

/**
 * List all supported MC versions grouped by workflow.
 */
export function listSupportedVersions(): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('=== Supported Minecraft Versions ===');
  lines.push('');

  const groups: Record<string, string[]> = {
    legacy_srg: [],
    legacy: [],
    legacy_proguard: [],
    modern: [],
  };

  const groupLabels: Record<string, string> = {
    legacy_srg: 'Legacy (SRG + MCP Stable CSV, 1.7.10-1.11.2)',
    legacy: 'Legacy (TSRGv1 + MCP Stable CSV, 1.12.2-1.15.2)',
    legacy_proguard: 'Legacy (TSRGv1 + ProGuard, 1.16.x)',
    modern: 'Modern (TSRGv2 + ProGuard, 1.17+)',
  };

  for (const version of Object.keys(VERSION_TABLE).sort()) {
    const config = VERSION_TABLE[version];
    groups[config.workflow].push(version);
  }

  for (const [workflow, versions] of Object.entries(groups)) {
    if (versions.length > 0) {
      lines.push(`${groupLabels[workflow]}:`);
      for (const v of versions) {
        lines.push(`  ${v}`);
      }
      lines.push('');
    }
  }

  lines.push('Not available (missing from NeoForge repo):');
  lines.push('  1.21+ (no MCPConfig)');

  return lines.join('\n');
}

/**
 * Get the URLs for a specific MC version as a formatted string.
 */
export function getVersionUrls(mcVersion: string): string {
  const config = VERSION_TABLE[mcVersion];
  if (!config) {
    return `[ERROR] MC version ${mcVersion} is not supported.`;
  }

  const lines: string[] = [];
  lines.push('');
  lines.push(`=== URLs for MC ${mcVersion} ===`);
  lines.push(`  Workflow: ${config.workflow}`);

  const mappingUrl = config.tsrg_url ?? config.srg_url ?? '';
  const urlLabel = config.workflow === 'legacy_srg' ? 'SRG URL' : 'TSRG URL';
  lines.push(`  ${urlLabel}: ${mappingUrl}`);

  if (config.mcp_stable_url) {
    lines.push(`  MCP Stable URL: ${config.mcp_stable_url}`);
  }
  if (config.proguard_url) {
    lines.push(`  ProGuard URL: ${config.proguard_url}`);
  }

  return lines.join('\n');
}
