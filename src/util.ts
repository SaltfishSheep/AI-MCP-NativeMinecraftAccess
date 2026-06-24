import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MCP_ROOT_DIR = path.resolve(__dirname, '..');
export const CACHE_DIR = path.join(MCP_ROOT_DIR, '.mapping-caches');
const PACKAGE_JSON_PATH = path.join(MCP_ROOT_DIR, 'package.json');

let _cachedPackageVersion: string | undefined;

export function getPackageVersion(): string {
  if (_cachedPackageVersion !== undefined) {
    return _cachedPackageVersion;
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as Record<string, unknown>;
    const raw = pkg['version'];
    _cachedPackageVersion = typeof raw === 'string' ? raw : 'unknown';
  } catch {
    _cachedPackageVersion = 'unknown';
  }
  return _cachedPackageVersion;
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  const cleanLine = line.replace(/\r/g, '');
  for (let i = 0; i < cleanLine.length; i++) {
    const ch = cleanLine[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < cleanLine.length && cleanLine[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}
