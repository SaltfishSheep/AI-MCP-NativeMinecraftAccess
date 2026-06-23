import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { MappingEntry, MappingInfo } from '../types.js';
import { CACHE_DIR } from '../types.js';
import { getPackageVersion } from '../util.js';

// ============================================================================
// CSV Helpers
// ============================================================================

/**
 * Escape a value for CSV output (wrap in quotes if it contains commas, quotes, or newlines).
 */
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serialize a MappingEntry array to CSV string with header.
 */
function entriesToCsv(entries: MappingEntry[]): string {
  const header = 'obf_class,deobf_class,type,obf_name,deobf_name,srg_name,desc,is_static,sideonly';
  const rows = entries.map((e) =>
    [
      csvEscape(e.obf_class),
      csvEscape(e.deobf_class),
      e.type,
      csvEscape(e.obf_name),
      csvEscape(e.deobf_name),
      csvEscape(e.srg_name),
      csvEscape(e.desc),
      e.is_static ? 'true' : 'false',
      e.sideonly,
    ].join(',')
  );
  return [header, ...rows].join('\n') + '\n';
}

// ============================================================================
// Cache Writing
// ============================================================================

/**
 * Write merged entries to CSV cache file using atomic write (write to temp, then rename).
 */
export function writeCache(entries: MappingEntry[], mcVersion: string, cacheDir: string = CACHE_DIR): void {
  const cachePath = join(cacheDir, `${mcVersion}.csv`);

  // Ensure directory exists
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  // Write to temp file first, then atomic rename
  const tmpPath = join(
    cacheDir,
    `.tmp-${mcVersion}-${randomBytes(6).toString('hex')}.csv`
  );

  try {
    writeFileSync(tmpPath, entriesToCsv(entries), 'utf-8');
    renameSync(tmpPath, cachePath);
  } catch (err) {
    // Clean up temp file on failure
    try {
      if (existsSync(tmpPath)) {
        unlinkSync(tmpPath);
      }
    } catch {
      // ignore cleanup error
    }
    throw err;
  }

  // Update mapping-info.json
  updateMappingInfo(mcVersion, cacheDir);

  console.error('');
  console.error(`[OK] Cache written to: ${cachePath}`);
  console.error(`  Total entries: ${entries.length}`);

  const methods = entries.filter((e) => e.type === 'method').length;
  const fields = entries.filter((e) => e.type === 'field').length;
  console.error(`  Methods: ${methods}`);
  console.error(`  Fields: ${fields}`);
}

// ============================================================================
// Mapping Info
// ============================================================================

/**
 * Update mapping-info.json with the current version's cache-version stamp.
 */
export function updateMappingInfo(mcVersion: string, cacheDir: string = CACHE_DIR): void {
  const mappingInfoPath = join(cacheDir, 'mapping-info.json');
  const cachesVersion = getPackageVersion();

  // Read existing mapping-info.json or create new
  let mappingInfo: MappingInfo = {};
  if (existsSync(mappingInfoPath)) {
    try {
      mappingInfo = JSON.parse(readFileSync(mappingInfoPath, 'utf-8')) as MappingInfo;
    } catch {
      // ignore parse errors
    }
  }

  mappingInfo[mcVersion] = cachesVersion;

  writeFileSync(mappingInfoPath, JSON.stringify(mappingInfo, null, '\t') + '\n', 'utf-8');
}
