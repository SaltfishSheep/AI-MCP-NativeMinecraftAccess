/**
 * Batch build script — rebuilds mapping caches for all supported MC versions.
 * Run with: npx tsx scripts/build-all.ts
 */

import { VERSION_TABLE } from '../src/version-table.js';
import { buildMappingCache } from '../src/builder/index.js';
import { CACHE_DIR } from '../src/util.js';

const versions = Object.keys(VERSION_TABLE).sort();

console.error(`=== Building caches for ${versions.length} MC versions ===`);
console.error(`Cache dir: ${CACHE_DIR}`);
console.error('');

const startTime = Date.now();
const results: { version: string; ok: boolean; error?: string; ms: number }[] = [];

for (const version of versions) {
  const vStart = Date.now();
  try {
    await buildMappingCache(version, CACHE_DIR, true);
    results.push({ version, ok: true, ms: Date.now() - vStart });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[FAIL] MC ${version}: ${msg}`);
    results.push({ version, ok: false, error: msg, ms: Date.now() - vStart });
  }
}

const totalMs = Date.now() - startTime;

console.error('');
console.error('=== Summary ===');
const ok = results.filter((r) => r.ok);
const failed = results.filter((r) => !r.ok);
console.error(`Total: ${results.length} versions, ${ok.length} succeeded, ${failed.length} failed`);
console.error(`Total time: ${(totalMs / 1000).toFixed(1)}s`);

if (failed.length > 0) {
  console.error('');
  console.error('Failed versions:');
  for (const f of failed) {
    console.error(`  ${f.version}: ${f.error}`);
  }
}
