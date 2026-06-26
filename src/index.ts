#!/usr/bin/env node
/**
 * MCP Server for Minecraft Native Mapping Lookup.
 *
 * Provides a single tool `search` that searches Minecraft
 * obfuscated-to-deobfuscated name mappings. Automatically builds the
 * mapping cache on first use for a given MC version.
 *
 * Supports 38 MC versions (1.7.10 – 1.20.1).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { VERSION_TABLE } from './version-table.js';
import { buildMappingCache } from './builder/index.js';
import {
  parseExpression,
  validateCache,
  searchCacheAll,
  invalidateCache,
} from './search/index.js';
import { DEFAULT_LIMIT, ScoredMappingEntry } from './types.js';
import { CACHE_DIR } from './util.js';
import { getPackageVersion } from './util.js';

// ── Constants ────────────────────────────────────────────────────────────────

const SUPPORTED_VERSIONS = Object.keys(VERSION_TABLE).sort();

const DEFAULT_OUTPUT =
  '[%type%] %obf_class%/%obf_name% -> %deobf_class% %deobf_name% %srg_name% %obf_desc% %deobf_desc% %access% %is_static% %sideonly%';

/** Template variable names — keep in sync with ScoredMappingEntry fields */
const TEMPLATE_KEYS = [
  'type', 'obf_class', 'deobf_class', 'obf_name', 'deobf_name',
  'srg_name', 'obf_desc', 'deobf_desc', 'access', 'is_static',
  'sideonly', 'match', 'mismatch'
] as const;

// ── Output formatting ────────────────────────────────────────────────────────

/** Map a ScoredMappingEntry to a template variable dictionary. Keep in sync with TEMPLATE_KEYS. */
function entryVars(entry: ScoredMappingEntry): Record<string, string> {
  return {
    type: entry.type,
    obf_class: entry.obf_class,
    deobf_class: entry.deobf_class,
    obf_name: entry.obf_name,
    deobf_name: entry.deobf_name,
    srg_name: entry.srg_name,
    obf_desc: entry.obf_desc,
    deobf_desc: entry.deobf_desc,
    access: entry.access,
    is_static: entry.is_static,
    sideonly: entry.sideonly,
    match: entry.match.toFixed(1),
    mismatch: String(entry.mismatch),
  };
}

/**
 * Apply an output template to a single entry.
 * Template uses %variable% syntax (case-insensitive).
 * After substitution, consecutive runs of 2+ spaces are collapsed to one.
 */
function formatEntry(entry: ScoredMappingEntry, template: string): string {
  const vars = entryVars(entry);
  const result = template.replace(/%([^%]+)%/gi, (_match, key: string) => {
    return vars[key.toLowerCase()] ?? '';
  });
  // Collapse consecutive 2+ spaces into a single space, then trim
  return result.replace(/ {2,}/g, ' ').trim();
}

/**
 * Strip % delimiters from a template to produce a human-readable format header.
 * Example: "[%type%] %obf_class%/%obf_name%" → "[type] obf_class/obf_name"
 */
function formatHeader(template: string): string {
  return template.replace(/%/g, '');
}

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'native-mc-access-mcp-server',
  version: getPackageVersion(),
});

// ── Tool: search ─────────────────────────────────────────────────────────────

const SearchInputSchema = z.object({
  mc_version: z
    .string()
    .describe(
      `Minecraft version to search (e.g. "1.12.2", "1.20.1"). ` +
        `Supported: ${SUPPORTED_VERSIONS.join(', ')}`
    ),
  expression: z
    .string()
    .min(1, 'Expression must not be empty')
    .describe(
      `Boolean search expression (case-insensitive, exact case match scores higher). ` +
        `Syntax: term, term:modifier (substring match in column), term::modifier (exact match in column), ` +
        `a&b (AND), a|b (OR), {expr} (grouping with braces). ` +
        `Modifiers: all, class, classname, package, name, method, field, desc, modifier, side. ` +
        `& has higher precedence than |. ` +
        `Examples: "Entity::classname", "walk:method&static::modifier", "net/minecraft/entity:package"`
    ),
  page: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe('Page number (1-indexed). Default: 1'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(DEFAULT_LIMIT)
    .describe(`Number of results per page (default: ${DEFAULT_LIMIT}, max: 100)`),
  output: z
    .string()
    .default(DEFAULT_OUTPUT)
    .describe(
      `Output format template using %variable% syntax (case-insensitive). ` +
        `Variables: %type%, %obf_class%, %obf_name%, %deobf_class%, %deobf_name%, ` +
        `%srg_name%, %obf_desc%, %deobf_desc%, %access%, %is_static% (static/non-static), ` +
        `%sideonly%, %match%, %mismatch%. ` +
        `Consecutive spaces collapsed. Identical outputs deduplicated.`
    ),
});

type SearchInput = z.infer<typeof SearchInputSchema>;

server.registerTool(
  'search',
  {
    title: 'Search Native MC Access',
    description: `Search Minecraft obfuscated↔deobfuscated name mappings (classes/methods/fields).

expression syntax:
  term — case-insensitive substring
  term:modifier — substring match in column; term::modifier — exact match in column
  a&b (AND) | a|b (OR) | {expr} (grouping). & has higher precedence than |.
  "net.minecraft.Entity" auto-expands to "/" and "$" paths.
  Cross-version tip: "Player&Entity" works better than "EntityPlayer".

Modifiers:
  all (default) — all columns (excludes sideonly)
  class — obf_class, deobf_class (full path)
  classname — class name after last '/'
  package — package before last '/'
  name — obf_name, deobf_name, srg_name (methods+fields)
  method — same columns, methods only
  field — same columns, fields only
  desc — obf_desc, deobf_desc
  modifier — access (public/private/protected/default), is_static (static/non-static)
  side — sideonly (common/server/client)

Scoring: exact case hit = 1.0, case-insensitive = 0.5, then by mismatch (less unmatched chars ranks higher).

Common patterns:
  "Entity::classname" → exact class name only
  "Gui:classname" → all classes containing "Gui"
  "net/minecraft/inventory:package" → all classes under a package
  "health:field" → fields only, no methods
  "()Z:desc" → methods returning boolean
  "get:method&static::modifier" → static methods containing "get"
  output="%deobf_class%" → deduplicated class list`,
    inputSchema: SearchInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async (params: SearchInput) => {
    try {
      // Validate MC version
      if (!VERSION_TABLE[params.mc_version]) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: MC version "${params.mc_version}" is not supported.\nSupported versions: ${SUPPORTED_VERSIONS.join(', ')}`,
            },
          ],
        };
      }

      // Parse boolean expression
      let astRoot;
      try {
        astRoot = parseExpression(params.expression);
      } catch (e) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: Invalid expression "${params.expression}": ${e instanceof Error ? e.message : String(e)}\nSyntax: term, a&b (AND), a|b (OR), {expr} (grouping with braces)`,
            },
          ],
        };
      }

      // Auto-build cache if missing or invalid
      if (!validateCache(params.mc_version)) {
        console.error(`[native-mc-access] Cache missing for MC ${params.mc_version}, building...`);
        await buildMappingCache(params.mc_version, CACHE_DIR, true);
        if (!validateCache(params.mc_version)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: Failed to build mapping cache for MC ${params.mc_version}. Check server logs for details.`,
              },
            ],
          };
        }
        invalidateCache();
      }

      // Search all matching entries (no pagination yet)
      const allResults = searchCacheAll(params.mc_version, astRoot, CACHE_DIR);

      if (allResults.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No results found for "${params.expression}" in MC ${params.mc_version}.`,
            },
          ],
        };
      }

      // Merge formatting + deduplication in a single pass
      const seen = new Set<string>();
      const deduplicated: { formatted: string; entry: ScoredMappingEntry }[] = [];

      for (const entry of allResults) {
        const f = formatEntry(entry, params.output);
        if (!seen.has(f)) {
          seen.add(f);
          deduplicated.push({ formatted: f, entry });
        }
      }

      // Paginate
      const total = deduplicated.length;
      const totalPages = Math.max(1, Math.ceil(total / params.limit));
      const clampedPage = Math.max(1, Math.min(params.page, totalPages));
      const start = (clampedPage - 1) * params.limit;
      const pageResults = deduplicated.slice(start, start + params.limit);

      // Build output
      const lines: string[] = [];
      lines.push(`Format: ${formatHeader(params.output)}`);
      lines.push(
        `Found ${total} results for "${params.expression}" in MC ${params.mc_version}` +
          (totalPages > 1 ? ` (page ${clampedPage}/${totalPages})` : '')
      );
      lines.push('');

      for (let i = 0; i < pageResults.length; i++) {
        const globalIdx = start + i + 1;
        lines.push(`  ${globalIdx}. ${pageResults[i].formatted}`);
      }

      if (totalPages > 1 && clampedPage < totalPages) {
        lines.push('');
        lines.push(`Use page=${clampedPage + 1} to see more results.`);
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('native-mc-access MCP server running via stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
