[English](README.md) | [中文](README_zh-CN.md)

# Native MC Mapping MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that provides Minecraft obfuscated name mapping lookups. Helps AI coding agents work with Minecraft's obfuscated Java internals — for modding, plugin development, Mixin, Access Transformers, reflection-based scripting, and more.

## What It Does

Minecraft's Java code is obfuscated at runtime — class, method, and field names are replaced with short meaningless identifiers (`aed`, `func_70091_d`, `m_91087_`). This MCP server lets your AI agent:

- **Search obfuscated ↔ deobfuscated mappings** across 38 Minecraft versions (1.7.10 – 1.20.1)
- **Auto-build mapping caches** on first use — downloads from NeoForge Maven and Mojang servers
- **Boolean expression search** — `Entity&Player`, `{Block|Item}&client`, `func_149645`

### Use Cases

| Scenario | How This Helps |
|----------|---------------|
| **Forge / NeoForge modding** | Look up obfuscated method/field names when writing mixins or AT configs |
| **Fabric modding** | Find intermediary ↔ named mappings for access wideners |
| **Spigot / Paper plugins** | Resolve NMS (net.minecraft.server) class names across versions |
| **Mixin / Access Transformers** | Discover the exact obfuscated name to target |
| **Reflection-based code** | Find field/method names for `getDeclaredField`, `getMethod`, etc. |
| **Scripting engines** | Resolve native Minecraft API names (CustomNPCs, CraftTweaker, etc.) |
| **Porting mods** | Compare mappings between MC versions to find renamed APIs |

### MCP Tools

| Tool | Description |
|------|-------------|
| `search` | Search Minecraft obfuscated class/method/field name mappings |

## Quick Install (MCP Client)

### Prerequisites

- **Node.js ≥ 18**

### Step 1: Clone & Build

```bash
git clone https://github.com/SaltfishSheep/AI-MCP-NativeMinecraftAccess.git
cd AI-MCP-NativeMinecraftAccess
npm install
npm run build
```

### Step 2: Add to Your MCP Client

Add the following to your MCP client configuration:

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "native-mc-access": {
      "command": "node",
      "args": ["/absolute/path/to/AI-MCP-NativeMinecraftAccess/dist/index.js"]
    }
  }
}
```

**OpenCode** (`opencode.json`):

```json
{
  "mcp": {
    "native-mc-access": {
      "type": "local",
      "command": ["node", "/absolute/path/to/AI-MCP-NativeMinecraftAccess/dist/index.js"],
      "enabled": true
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "native-mc-access": {
      "command": "node",
      "args": ["/absolute/path/to/AI-MCP-NativeMinecraftAccess/dist/index.js"]
    }
  }
}
```

**Windsurf** (`~/.codeium/windsurf/mcp_config.json`):

```json
{
  "mcpServers": {
    "native-mc-access": {
      "command": "node",
      "args": ["/absolute/path/to/AI-MCP-NativeMinecraftAccess/dist/index.js"]
    }
  }
}
```

> Replace `/absolute/path/to/` with the actual path where you cloned the repo.

## Usage

Once configured, your AI agent can call the `search` tool:

```
search(mc_version="1.12.2", expression="Entity&Player")
```

### Tool Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `mc_version` | string | Yes | - | Minecraft version (e.g. "1.12.2", "1.20.1") |
| `expression` | string | Yes | - | Boolean search expression |
| `page` | number | No | 1 | Page number (1-indexed) |
| `limit` | number | No | 20 | Results per page (max 100) |
| `output` | string | No | default template | Output format template using `%variable%` syntax |

**Output template variables:** `%type%`, `%obf_class%`, `%deobf_class%`, `%obf_name%`, `%deobf_name%`, `%srg_name%`, `%obf_desc%`, `%deobf_desc%`, `%access%`, `%is_static%`, `%sideonly%`, `%match%`, `%mismatch%`

**Example queries:**

| Query | Description |
|-------|-------------|
| `Entity&Player` | Entries containing both "Entity" AND "Player" |
| `Entity::classname` | Class name exactly "Entity" |
| `walk:method` | Methods with "walk" in name |
| `static::modifier` | is_static exactly "static" |
| `Potion:classname&Duration:name` | Class name "Potion", name "Duration" |
| `{Block\|Item}&client` | Client-side Block or Item entries |
| `func_70091_d` | Find a specific SRG method name by ID |
| `KeyBinding` | All entries mentioning KeyBinding |
| `output="%deobf_class%"` | Deduplicated class list |

**Expression syntax:**

| Syntax | Meaning | Example |
|--------|---------|---------|
| `term` | Case-insensitive substring match (exact case scores higher) | `KeyBinding` |
| `term:modifier` | Restrict search to specific columns | `Potion:classname`, `walk:method` |
| `term::modifier` | Strong modifier — exact match required | `Entity::classname` |
| `net.minecraft.Entity` | Dot notation — matches `net/minecraft/Entity` and `net/minecraft$Entity` | `net.minecraft.entity.Entity` |
| `&` | AND (both must match, higher precedence) | `Entity&Living` |
| `\|` | OR (either must match) | `Entity\|Player` |
| `{}` | Grouping | `{a\|b}&c` |

**Modifiers:**

| Modifier | Searches | Description |
|----------|----------|-------------|
| `all` | all columns | Default — searches all text columns (excludes sideonly) |
| `class` | obf_class, deobf_class | Full class path (e.g. `net/minecraft/entity/Entity`) |
| `classname` | deobf_class (after last `/`) | Class name only (e.g. `Entity` from `net/minecraft/entity/Entity`) |
| `package` | deobf_class (before last `/`) | Package only (e.g. `net/minecraft/entity`) |
| `name` | obf_name, deobf_name, srg_name | Field/method names (methods+fields only) |
| `method` | obf_name, deobf_name, srg_name | Method names only (filters type=method) |
| `field` | obf_name, deobf_name, srg_name | Field names only (filters type=field) |
| `desc` | obf_desc, deobf_desc | Method/field descriptors |
| `modifier` | access, is_static | Access level and static status (note: `access` is always empty — data sources lack access info) |
| `side` | sideonly | Side filter (common/server/client) |

Tips: Use `Player&Entity` instead of `PlayerEntity` for cross-version compatibility, as naming conventions differ across MC versions.

## Supported Versions

38 Minecraft versions across 4 workflow types:

| Workflow | Versions | Data Sources |
|----------|----------|--------------|
| Legacy SRG | 1.7.10, 1.8, 1.8.8–1.9.4, 1.10.2–1.11.2 | SRG ZIP + MCP Stable CSV + static_methods |
| Legacy TSRGv1 | 1.12.2–1.14.4, 1.15–1.15.2 | TSRGv1 + MCP Stable CSV + static_methods + constructors |
| Legacy ProGuard | 1.16.1–1.16.5 | TSRGv1 + Mojang ProGuard + static_methods |
| Modern | 1.17–1.17.1, 1.18–1.18.2, 1.19–1.19.4, 1.20–1.20.1 | TSRGv2 + Mojang ProGuard |

## How It Works

1. On first search for a given MC version, the server downloads mapping data from [NeoForge Maven](https://maven.neoforged.net/) and [Mojang](https://piston-data.mojang.com/)
2. It parses SRG/TSRG/ProGuard formats and merges them with MCP CSV data
3. The merged cache is stored as `.mapping-caches/<version>.csv`
4. Subsequent searches use the cached data (validated against `package.json` version)
5. Boolean expressions are parsed into an AST and evaluated against all CSV rows

## Output Format

```
Format: [type] obf_class/obf_name -> deobf_class deobf_name srg_name obf_desc deobf_desc access is_static sideonly
Found 382 results for "Entity&Player" in MC 1.12.2 (page 1/39)

  1. [method] aed/cD -> net/minecraft/entity/player/EntityPlayer.getAbsorptionAmount func_110139_bj ()F  non-static common
  2. [method] aed/bM -> net/minecraft/entity/player/EntityPlayer.applyEntityAttributes func_110147_ax ()V  non-static common
  ...
```

## Project Structure

```
AI-MCP-NativeMinecraftAccess/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── types.ts              # TypeScript type definitions
│   ├── util.ts               # Shared utilities (CSV parsing, package version)
│   ├── version-table.ts      # URL mapping table for 38 MC versions
│   ├── builder/
│   │   ├── index.ts          # buildMappingCache entry point
│   │   ├── download.ts       # HTTP fetch + minimal ZIP reader
│   │   ├── parsers.ts        # SRG, TSRGv1, TSRGv2, ProGuard, CSV parsers
│   │   ├── workflows.ts      # 4 merge workflow builders
│   │   └── cache.ts          # CSV cache writer + mapping-info update
│   └── search/
│       ├── index.ts          # Barrel exports
│       ├── expression.ts     # Boolean expression parser (AND/OR/braces)
│       └── csv-reader.ts     # CSV reader + scoring + in-memory cache
├── dist/                     # Built JavaScript (entry: dist/index.js)
└── .mapping-caches/          # Generated cache files (gitignored)
```

## License

MIT License — see [LICENSE](LICENSE).

### Third-Party Data

- **Mojang mappings** — Provided under [Mojang's custom license](https://account.mojang.com/documents/minecraft_eula). This server fetches them at runtime; it does NOT redistribute them.
- **MCP mappings** — Maintained by the Mod Coder Pack community, distributed via NeoForge Maven.
