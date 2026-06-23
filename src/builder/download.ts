import { Buffer } from 'node:buffer';
import { inflateRawSync } from 'node:zlib';
import https from 'node:https';
import http from 'node:http';

// ============================================================================
// HTTP Fetch Helpers (using built-in https, no external dependencies)
// ============================================================================

function fetchUrl(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'MinecraftMappingCacheBuilder/1.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP error ${res.statusCode} fetching ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(120_000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

export async function fetchBytes(url: string): Promise<Buffer> {
  console.error(`  Downloading: ${url}`);
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetchUrl(url);
    } catch (err) {
      if (attempt < maxRetries) {
        console.error(`  Retry ${attempt}/${maxRetries}...`);
        await new Promise(r => setTimeout(r, 2000 * attempt));
      } else {
        throw err;
      }
    }
  }
  throw new Error('Unreachable');
}

export async function fetchText(url: string): Promise<string> {
  const bytes = await fetchBytes(url);
  return bytes.toString('utf-8');
}

// ============================================================================
// Minimal ZIP Reader (no external dependencies)
// ============================================================================

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedData: Buffer;
  uncompressedSize: number;
}

/**
 * Read a little-endian uint16 from a buffer at the given offset.
 */
function readUint16LE(buf: Buffer, offset: number): number {
  return buf.readUInt16LE(offset);
}

/**
 * Read a little-endian uint32 from a buffer at the given offset.
 */
function readUint32LE(buf: Buffer, offset: number): number {
  return buf.readUInt32LE(offset);
}

/**
 * Parse ZIP entries from a buffer. Supports stored (method 0) and deflated (method 8).
 */
function parseZipEntries(zipBytes: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];

  // Find End of Central Directory record (EOCD)
  // EOCD signature: 0x06054b50
  // Located at end of file: 22 bytes minimum (without comment)
  let eocdOffset = -1;
  for (let i = zipBytes.length - 22; i >= 0; i--) {
    if (readUint32LE(zipBytes, i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Invalid ZIP: end of central directory not found');
  }

  const centralDirOffset = readUint32LE(zipBytes, eocdOffset + 16);
  const numEntries = readUint16LE(zipBytes, eocdOffset + 10);

  // Parse central directory entries
  let offset = centralDirOffset;
  for (let i = 0; i < numEntries; i++) {
    // Central directory entry header
    if (readUint32LE(zipBytes, offset) !== 0x02014b50) {
      throw new Error(`Invalid ZIP: bad central directory signature at offset ${offset}`);
    }
    const compressionMethod = readUint16LE(zipBytes, offset + 10);
    const compressedSize = readUint32LE(zipBytes, offset + 20);
    const uncompressedSize = readUint32LE(zipBytes, offset + 24);
    const nameLength = readUint16LE(zipBytes, offset + 28);
    const extraLength = readUint16LE(zipBytes, offset + 30);
    const commentLength = readUint16LE(zipBytes, offset + 32);
    const localHeaderOffset = readUint32LE(zipBytes, offset + 42);

    const name = zipBytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf-8');

    // Read from local file header to get the actual data offset
    const localNameLength = readUint16LE(zipBytes, localHeaderOffset + 26);
    const localExtraLength = readUint16LE(zipBytes, localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;

    const compressedData = zipBytes.subarray(dataOffset, dataOffset + compressedSize);

    entries.push({
      name,
      compressionMethod,
      compressedData: Buffer.from(compressedData),
      uncompressedSize,
    });

    // Move to next central directory entry
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * Extract a single file's text content from a ZIP buffer.
 */
function extractEntry(entry: ZipEntry): string {
  let data: Buffer;

  if (entry.compressionMethod === 0) {
    // Stored (no compression)
    data = entry.compressedData;
  } else if (entry.compressionMethod === 8) {
    // Deflated
    data = Buffer.from(inflateRawSync(entry.compressedData));
  } else {
    throw new Error(`Unsupported ZIP compression method: ${entry.compressionMethod}`);
  }

  if (data.length !== entry.uncompressedSize) {
    throw new Error(
      `ZIP entry size mismatch for "${entry.name}": expected ${entry.uncompressedSize}, got ${data.length}`
    );
  }

  return data.toString('utf-8');
}

/**
 * Extract a file from a ZIP archive by path.
 * Tries exact match first, then matches by suffix (like Python's zipfile behavior).
 */
export function extractFromZip(zipBytes: Buffer, path: string): string {
  const entries = parseZipEntries(zipBytes);

  // Try exact path first
  const exact = entries.find((e) => e.name === path);
  if (exact) {
    return extractEntry(exact);
  }

  // Try with leading slash removed
  const pathNoSlash = path.replace(/^\/+/, '');
  const suffix = entries.find(
    (e) => e.name === pathNoSlash || e.name.endsWith('/' + pathNoSlash)
  );
  if (suffix) {
    return extractEntry(suffix);
  }

  throw new Error(`File "${path}" not found in ZIP archive`);
}

/**
 * Extract a file from a ZIP archive, returning null if not found.
 */
export function extractOptionalFromZip(
  zipBytes: Buffer,
  path: string,
  label?: string
): string | null {
  try {
    return extractFromZip(zipBytes, path);
  } catch {
    if (label) {
      console.error(`  Note: ${label} not found, skipping`);
    }
    return null;
  }
}
