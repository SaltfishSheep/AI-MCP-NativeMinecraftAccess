[English](README.md) | [中文](README_zh-CN.md)

# Native MC Mapping MCP Server

一个 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 服务器，用于查找 Minecraft 混淆名称映射。帮助 AI 编程助手处理 Minecraft 混淆的 Java 内部 API——适用于模组开发、插件开发、Mixin、Access Transformer、反射脚本等多种场景。

## 功能

Minecraft 的 Java 代码在运行时是混淆的——类名、方法名、字段名都被替换为无意义的短标识符（`aed`、`func_70091_d`、`m_91087_`）。这个 MCP 服务器让你的 AI 助手能够：

- **搜索混淆 ↔ 反混淆映射**，覆盖 38 个 Minecraft 版本（1.7.10 – 1.20.1）
- **自动构建映射缓存**——首次使用时从 NeoForge Maven 和 Mojang 服务器下载
- **布尔表达式搜索**——`Entity&Player`、`{Block|Item}&client`、`func_149645`

### 使用场景

| 场景 | 用途 |
|------|------|
| **Forge / NeoForge 模组开发** | 编写 Mixin 或 AT 配置时查找混淆的方法/字段名 |
| **Fabric 模组开发** | 查找 access widener 所需的 intermediary ↔ named 映射 |
| **Spigot / Paper 插件** | 解析不同版本的 NMS（net.minecraft.server）类名 |
| **Mixin / Access Transformer** | 确定要定位的精确混淆名 |
| **反射代码** | 为 `getDeclaredField`、`getMethod` 等查找字段/方法名 |
| **脚本引擎** | 解析原生 Minecraft API 名称（CustomNPCs、CraftTweaker 等） |
| **模组移植** | 比较不同 MC 版本的映射，找到已重命名的 API |

### MCP 工具

| 工具 | 描述 |
|------|------|
| `search` | 搜索 Minecraft 混淆的类/方法/字段名映射 |

## 快速安装（MCP 客户端）

### 前置要求

- **Node.js ≥ 18**

### 第一步：克隆并构建

```bash
git clone https://github.com/SaltfishSheep/AI-MCP-NativeMinecraftAccess.git
cd AI-MCP-NativeMinecraftAccess
npm install
npm run build
```

### 第二步：添加到 MCP 客户端

将以下内容添加到你的 MCP 客户端配置文件中：

**Claude Desktop** (`claude_desktop_config.json`)：

```json
{
  "mcpServers": {
    "native-mc-access": {
      "command": "node",
      "args": ["/绝对路径/to/AI-MCP-NativeMinecraftAccess/dist/index.js"]
    }
  }
}
```

**OpenCode** (`opencode.json`)：

```json
{
  "mcp": {
    "native-mc-access": {
      "type": "local",
      "command": ["node", "/绝对路径/to/AI-MCP-NativeMinecraftAccess/dist/index.js"],
      "enabled": true
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`)：

```json
{
  "mcpServers": {
    "native-mc-access": {
      "command": "node",
      "args": ["/绝对路径/to/AI-MCP-NativeMinecraftAccess/dist/index.js"]
    }
  }
}
```

**Windsurf** (`~/.codeium/windsurf/mcp_config.json`)：

```json
{
  "mcpServers": {
    "native-mc-access": {
      "command": "node",
      "args": ["/绝对路径/to/AI-MCP-NativeMinecraftAccess/dist/index.js"]
    }
  }
}
```

> 将 `/绝对路径/to/` 替换为你实际克隆仓库的路径。

## 使用方法

配置完成后，你的 AI 助手可以调用 `search` 工具：

```
search(mc_version="1.12.2", expression="Entity&Player")
```

**查询示例：**

| 查询 | 描述 |
|------|------|
| `Entity&Player` | 包含 "Entity" 和 "Player" 的条目 |
| `Entity::classname` | 类名恰好为 "Entity" |
| `walk:method` | 名称含 "walk" 的方法 |
| `static::modifier` | is_static 或 access 恰好为 "static" |
| `Potion:classname&Duration:name` | 类名 "Potion"，名称 "Duration" |
| `{Block\|Item}&client` | 客户端的 Block 或 Item 条目 |
| `func_70091_d` | 通过 SRG ID 查找特定方法名 |
| `output="%deobf_class%"` | 去重后的类列表 |

**表达式语法：**

| 语法 | 含义 | 示例 |
|------|------|------|
| `term` | 大小写不敏感的子串匹配（精确大小写得分更高） | `KeyBinding` |
| `term:modifier` | 限制搜索到特定列 | `Potion:classname`、`walk:method` |
| `term::modifier` | 强修饰符——要求精确匹配 | `Entity::classname` |
| `net.minecraft.Entity` | 点号路径——匹配 `net/minecraft/Entity` 和 `net/minecraft$Entity` | `net.minecraft.entity.Entity` |
| `&` | 且（两者都必须匹配，优先级更高） | `Entity&Living` |
| `\|` | 或（任一匹配即可） | `Entity\|Player` |
| `{}` | 分组 | `{a\|b}&c` |

**修饰符：**

| 修饰符 | 搜索范围 | 说明 |
|--------|----------|------|
| `all` | 所有列 | 默认——搜索全部 |
| `class` | obf_class, deobf_class | 完整类路径（如 `net/minecraft/entity/Entity`） |
| `classname` | deobf_class（最后一个 `/` 之后） | 仅类名（如 `net/minecraft/entity/Entity` 中的 `Entity`） |
| `package` | deobf_class（最后一个 `/` 之前） | 仅包名（如 `net/minecraft/entity`） |
| `name` | obf_name, deobf_name, srg_name | 字段/方法名（仅方法+字段条目） |
| `method` | obf_name, deobf_name, srg_name | 仅方法名（筛选 type=method） |
| `field` | obf_name, deobf_name, srg_name | 仅字段名（筛选 type=field） |
| `desc` | obf_desc, deobf_desc | 方法描述符 |
| `modifier` | access, is_static | 访问级别和静态状态 |
| `side` | sideonly | 侧边筛选（common/server/client） |

提示：使用 `Player&Entity` 而非 `PlayerEntity`，以获得最佳跨版本兼容性（不同版本命名风格不同）。

## 支持版本

38 个 Minecraft 版本，涵盖 4 种工作流：

| 工作流 | 版本 | 数据源 |
|--------|------|--------|
| Legacy SRG | 1.7.10, 1.8–1.11.2 | SRG ZIP + MCP Stable CSV |
| Legacy TSRGv1 | 1.12.2–1.15.2 | TSRGv1 + MCP Stable CSV + static_methods + constructors |
| Legacy ProGuard | 1.16.1–1.16.5 | TSRGv1 + Mojang ProGuard |
| Modern | 1.17–1.20.1 | TSRGv2 + Mojang ProGuard |

## 工作原理

1. 首次搜索某个 MC 版本时，服务器从 [NeoForge Maven](https://maven.neoforged.net/) 和 [Mojang](https://piston-data.mojang.com/) 下载映射数据
2. 解析 SRG/TSRG/ProGuard 格式，并与 MCP CSV 数据合并
3. 合并后的缓存存储为 `.mapping-caches/<version>.csv`
4. 后续搜索使用缓存数据（通过 `package.json` 版本号验证有效性）
5. 布尔表达式被解析为 AST，对所有 CSV 行进行求值

## 输出格式

```
Found 382 results for "Entity&Player" in MC 1.12.2 (page 1/39)

  1. [method] aed.cD -> net/minecraft/entity/player/EntityPlayer.getAbsorptionAmount  srg=func_110139_bj  desc=()F  sideonly=common  match=2.0 mismatch=42
  2. [method] aed.bM -> net/minecraft/entity/player/EntityPlayer.applyEntityAttributes  srg=func_110147_ax  desc=()V  sideonly=common  match=2.0 mismatch=42
  ...
```

## 项目结构

```
AI-MCP-NativeMinecraftAccess/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # MCP 服务器入口
│   ├── types.ts              # TypeScript 类型定义
│   ├── util.ts               # 共享工具（CSV 解析、package 版本读取）
│   ├── version-table.ts      # 38 个 MC 版本的 URL 映射表
│   ├── builder/
│   │   ├── index.ts          # buildMappingCache 入口
│   │   ├── download.ts       # HTTP 下载 + 最小 ZIP 读取器
│   │   ├── parsers.ts        # SRG、TSRGv1、TSRGv2、ProGuard、CSV 解析器
│   │   ├── workflows.ts      # 4 种合并工作流构建器
│   │   └── cache.ts          # CSV 缓存写入 + 验证
│   └── search/
│       ├── index.ts          # 重导出
│       ├── expression.ts     # 布尔表达式解析器（AND/OR/花括号）
│       └── csv-reader.ts     # CSV 读取 + 分页搜索
├── dist/                     # 构建输出（入口：dist/index.js）
└── .mapping-caches/          # 生成的缓存文件（已 gitignore）
```

## 许可证

MIT 许可证 — 详见 [LICENSE](LICENSE)。

### 第三方数据

- **Mojang 映射** — 根据 [Mojang 自定义许可证](https://account.mojang.com/documents/minecraft_eula) 提供。本服务器在运行时获取它们，**不会**重新分发。
- **MCP 映射** — 由 Mod Coder Pack 社区维护，通过 NeoForge Maven 分发。
