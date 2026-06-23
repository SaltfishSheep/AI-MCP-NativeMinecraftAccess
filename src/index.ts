#!/usr/bin/env node
/**
 * MCP Server for Minecraft Native Mapping Lookup.
 *
 * Provides a single tool `search_native_mc` that searches Minecraft
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
  searchCache,
  searchClasses,
  formatRow,
} from './search/index.js';
import { CACHE_DIR, DEFAULT_LIMIT } from './types.js';

// ── Constants ────────────────────────────────────────────────────────────────

const SUPPORTED_VERSIONS = Object.keys(VERSION_TABLE).sort();

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'native-mc-mapping-mcp-server',
  version: '1.0.0',
});

// ── Tool: search_native_mc ───────────────────────────────────────────────────

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
      `Boolean search expression. ` +
        `Syntax: term (case-insensitive substring), a&b (AND), a|b (OR), (expr) (grouping). ` +
        `& has higher precedence than |. ` +
        `Examples: "Entity&Player", "(Entity|Block)&client", "KeyBinding"`
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
});

type SearchInput = z.infer<typeof SearchInputSchema>;

server.registerTool(
  'search_native_mc',
  {
    title: 'Search Native MC Mapping',
    description: `Search Minecraft obfuscated class/method/field name mappings.

Looks up the mapping between obfuscated (runtime) names and deobfuscated (human-readable) names
for Minecraft Java classes, methods, and fields. This is essential when writing mod code, plugins,
or scripts that access native Minecraft internals via reflection or Mixin.

The tool automatically builds the mapping cache on first use for a given MC version (requires
internet access to download from NeoForge Maven and Mojang servers). Subsequent searches for
the same version use the cached data.

Search columns: obf_class, deobf_class, obf_name, deobf_name, srg_name.

Args:
  mc_version (string): Minecraft version (e.g. "1.12.2", "1.20.1")
  expression (string): Boolean search expression:
    - term: case-insensitive substring match (e.g. "Entity", "Player")
    - term:modifier: restrict match scope (e.g. "Potion:class", "Duration:name")
      Modifiers: class, name, method, field, desc
    - a&b: AND (both must match), higher precedence
    - a|b: OR (either must match)
    - (expr): grouping
    - Examples: "Entity&Player", "Potion:class&Duration:name", "(Entity|Block)&client"
  page (number): Page number, 1-indexed (default: 1)
  limit (number): Results per page (default: 20, max: 100)

Results are sorted by match score (more terms matched = higher) then mismatch (shorter results = higher).

Returns:
  Formatted list of matching mappings showing:
    [method/field] obf_class.obf_name -> deobf_class.deobf_name  srg=srg_name  desc=...  sideonly=...  match=...  mismatch=...

Examples:
  - search_native_mc("1.12.2", "Entity&Player") → entries with both "Entity" AND "Player"
  - search_native_mc("1.12.2", "Potion:class&Duration:name") → class has "Potion", name has "Duration"
  - search_native_mc("1.20.1", "(Block|Item)&client") → client-side Block or Item entries
  - search_native_mc("1.12.2", "func_149645") → find a specific SRG method name`,
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
              text: `Error: Invalid expression "${params.expression}": ${e instanceof Error ? e.message : String(e)}\nSyntax: term, a&b (AND), a|b (OR), (expr) (grouping)`,
            },
          ],
        };
      }

      // Auto-build cache if missing or invalid
      if (!validateCache(params.mc_version)) {
        console.error(`[native-mc-mapping] Cache missing for MC ${params.mc_version}, building...`);
        await buildMappingCache(params.mc_version, CACHE_DIR, false);
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
      }

      // Search
      const result = searchCache(params.mc_version, astRoot, params.page, params.limit, CACHE_DIR);

      if (result.total === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No results found for "${params.expression}" in MC ${params.mc_version}.`,
            },
          ],
        };
      }

      // Format output
      const lines: string[] = [];
      lines.push(
        `Found ${result.total} results for "${params.expression}" in MC ${params.mc_version}` +
          (result.totalPages > 1
            ? ` (page ${result.page}/${result.totalPages})`
            : '')
      );
      lines.push('');

      for (let i = 0; i < result.results.length; i++) {
        const entry = result.results[i];
        const globalIdx = (result.page - 1) * result.limit + i + 1;
        const desc = entry.desc ? `  desc=${entry.desc}` : '';
        lines.push(
          `  ${globalIdx}. [${entry.type}] ${entry.obf_class}.${entry.obf_name} -> ${entry.deobf_class}.${entry.deobf_name}  srg=${entry.srg_name}${desc}  sideonly=${entry.sideonly}  match=${entry.match.toFixed(1)} mismatch=${entry.mismatch}`
        );
      }

      if (result.totalPages > 1 && result.page < result.totalPages) {
        lines.push('');
        lines.push(`Use page=${result.page + 1} to see more results.`);
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

// ── Tool: search_native_mc_class ─────────────────────────────────────────────

const ClassSearchInputSchema = z.object({
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
      `Boolean search expression — matches only against class names (obf_class, deobf_class). ` +
        `Syntax: term (case-insensitive substring), a&b (AND), a|b (OR), (expr) (grouping). ` +
        `Examples: "Entity&Player", "Potion|Effect", "net/minecraft/entity"`
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
});

type ClassSearchInput = z.infer<typeof ClassSearchInputSchema>;

server.registerTool(
  'search_native_mc_class',
  {
    title: 'Search Native MC Class Names',
    description: `Search Minecraft obfuscated class name mappings (classes only).

A fast lookup tool that returns unique class names matching the expression.
Useful for quickly discovering which Minecraft classes are relevant before
searching for specific methods/fields.

The tool automatically builds the mapping cache on first use for a given MC version.

Args:
  mc_version (string): Minecraft version (e.g. "1.12.2", "1.20.1")
  expression (string): Boolean search expression matching class names only:
    - term: case-insensitive substring match (e.g. "Entity", "Potion")
    - a&b: AND (both must match), higher precedence
    - a|b: OR (either must match)
    - (expr): grouping
    - Examples: "Entity&Player", "Potion|Effect", "net/minecraft/entity"
  page (number): Page number, 1-indexed (default: 1)
  limit (number): Results per page (default: 20, max: 100)

Returns:
  Deduplicated list of matching classes:
    obf_class -> deobf_class  match=...  mismatch=...

Examples:
  - search_native_mc_class("1.12.2", "Entity&Player") → classes with both "Entity" AND "Player"
  - search_native_mc_class("1.12.2", "Potion|Effect") → classes with "Potion" OR "Effect"
  - search_native_mc_class("1.20.1", "net/minecraft/world") → classes in the world package`,
    inputSchema: ClassSearchInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async (params: ClassSearchInput) => {
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
              text: `Error: Invalid expression "${params.expression}": ${e instanceof Error ? e.message : String(e)}\nSyntax: term, a&b (AND), a|b (OR), (expr) (grouping)`,
            },
          ],
        };
      }

      // Auto-build cache if missing or invalid
      if (!validateCache(params.mc_version)) {
        console.error(`[native-mc-mapping] Cache missing for MC ${params.mc_version}, building...`);
        await buildMappingCache(params.mc_version, CACHE_DIR, false);
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
      }

      // Search classes only
      const result = searchClasses(params.mc_version, astRoot, params.page, params.limit, CACHE_DIR);

      if (result.total === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No classes found for "${params.expression}" in MC ${params.mc_version}.`,
            },
          ],
        };
      }

      // Format output
      const lines: string[] = [];
      lines.push(
        `Found ${result.total} classes for "${params.expression}" in MC ${params.mc_version}` +
          (result.totalPages > 1
            ? ` (page ${result.page}/${result.totalPages})`
            : '')
      );
      lines.push('');

      for (let i = 0; i < result.results.length; i++) {
        const entry = result.results[i];
        const globalIdx = (result.page - 1) * result.limit + i + 1;
        lines.push(
          `  ${globalIdx}. ${entry.obf_class} -> ${entry.deobf_class}  match=${entry.match.toFixed(1)} mismatch=${entry.mismatch}`
        );
      }

      if (result.totalPages > 1 && result.page < result.totalPages) {
        lines.push('');
        lines.push(`Use page=${result.page + 1} to see more results.`);
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
  console.error('native-mc-mapping MCP server running via stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
