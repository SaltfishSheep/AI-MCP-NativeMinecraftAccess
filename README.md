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
| `search_native_mc` | Search Minecraft obfuscated class/method/field name mappings |
| `search_native_mc_class` | Search class names only (deduplicated, for quick discovery) |

## Quick Install (MCP Client)

### Prerequisites

- **Node.js ≥ 18**

### Step 1: Clone & Build

```bash
git clone https://github.com/SaltfishSheep/AI-MCP-NativeMinecraftMapping.git
cd AI-MCP-NativeMinecraftMapping
npm install
npm run build
```

### Step 2: Add to Your MCP Client

Add the following to your MCP client configuration:

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "native-mc-mapping": {
      "command": "node",
      "args": ["/absolute/path/to/AI-MCP-NativeMinecraftMapping/dist/index.js"]
    }
  }
}
```

**OpenCode** (`opencode.json`):

```json
{
  "mcp": {
    "native-mc-mapping": {
      "type": "local",
      "command": ["node", "/absolute/path/to/AI-MCP-NativeMinecraftMapping/dist/index.js"],
      "enabled": true
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "native-mc-mapping": {
      "command": "node",
      "args": ["/absolute/path/to/AI-MCP-NativeMinecraftMapping/dist/index.js"]
    }
  }
}
```

**Windsurf** (`~/.codeium/windsurf/mcp_config.json`):

```json
{
  "mcpServers": {
    "native-mc-mapping": {
      "command": "node",
      "args": ["/absolute/path/to/AI-MCP-NativeMinecraftMapping/dist/index.js"]
    }
  }
}
```

> Replace `/absolute/path/to/` with the actual path where you cloned the repo.

## Usage

Once configured, your AI agent can call the `search_native_mc` tool:

```
search_native_mc(mc_version="1.12.2", expression="Entity&Player")
```

**Example queries:**

| Query | Description |
|-------|-------------|
| `Entity&Player` | Entries containing both "Entity" AND "Player" |
| `{Block\|Item}&client` | Client-side Block or Item entries |
| `func_70091_d` | Find a specific SRG method name by ID |
| `KeyBinding` | All entries mentioning KeyBinding |
| `m_91087_` | Find a TSRGv2 method (1.17+) |
| `motionX\|motionY\|motionZ` | Find entity velocity/motion fields |
| `setVelocity\|addVelocity` | Find methods related to entity momentum |

**Expression syntax:**

| Operator | Meaning | Example |
|----------|---------|---------|
| `term` | Case-insensitive substring match | `KeyBinding` |
| `term:modifier` | Restrict match scope or type | `Potion:class`, `walk:method`, `Z:desc` |
| `&` | AND (both must match, higher precedence) | `Entity&Living` |
| `\|` | OR (either must match) | `Entity\|Player` |
| `{}` | Grouping (braces, to avoid conflict with Java descriptors) | `{a\|b}&c` |

**Modifiers:**

| Modifier | Effect | Example |
|----------|--------|---------|
| `all` | Search all columns (default) | `Entity:all` |
| `class` | Search class names only | `Potion:class` |
| `name` | Search field/method names (methods+fields only) | `Duration:name` |
| `desc` | Search descriptor only | `()Z:desc` |
| `method` | Methods only | `walk:method` |
| `field` | Fields only | `health:field` |
| `static` | Static entries only | `get:static` |
| `sideonly` | Common (non-side-specific) entries only | `Entity:sideonly` |

## Supported Versions

38 Minecraft versions across 4 workflow types:

| Workflow | Versions | Data Sources |
|----------|----------|--------------|
| Legacy SRG | 1.7.10, 1.8–1.11.2 | SRG ZIP + MCP Stable CSV |
| Legacy TSRGv1 | 1.12.2–1.15.2 | TSRGv1 + MCP Stable CSV + static_methods + constructors |
| Legacy ProGuard | 1.16.1–1.16.5 | TSRGv1 + Mojang ProGuard |
| Modern | 1.17–1.20.1 | TSRGv2 + Mojang ProGuard |

## How It Works

1. On first search for a given MC version, the server downloads mapping data from [NeoForge Maven](https://maven.neoforged.net/) and [Mojang](https://piston-data.mojang.com/)
2. It parses SRG/TSRG/ProGuard formats and merges them with MCP CSV data
3. The merged cache is stored as `.mapping-caches/<version>.csv`
4. Subsequent searches use the cached data (validated against `package.json` version)
5. Boolean expressions are parsed into an AST and evaluated against all CSV rows

## Output Format

```
Found 382 results for "Entity&Player" in MC 1.12.2 (page 1/39)

  1. [method] aed.cD -> net/minecraft/entity/player/EntityPlayer.getAbsorptionAmount  srg=func_110139_bj  desc=()F  sideonly=common  match=2.0 mismatch=42
  2. [method] aed.bM -> net/minecraft/entity/player/EntityPlayer.applyEntityAttributes  srg=func_110147_ax  desc=()V  sideonly=common  match=2.0 mismatch=42
  ...
```

## Project Structure

```
AI-MCP-NativeMinecraftMapping/
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
│   │   └── cache.ts          # CSV cache writer + validator
│   └── search/
│       ├── index.ts          # Re-exports
│       ├── expression.ts     # Boolean expression parser (AND/OR/braces)
│       └── csv-reader.ts     # CSV reader + paginated search
├── dist/                     # Built JavaScript (entry: dist/index.js)
└── .mapping-caches/          # Generated cache files (gitignored)
```

## License

MIT License — see [LICENSE](LICENSE).

### Third-Party Data

- **Mojang mappings** — Provided under [Mojang's custom license](https://account.mojang.com/documents/minecraft_eula). This server fetches them at runtime; it does NOT redistribute them.
- **MCP mappings** — Maintained by the Mod Coder Pack community, distributed via NeoForge Maven.
