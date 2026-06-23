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
| `search_native_mc` | 搜索 Minecraft 混淆的类/方法/字段名映射 |
| `search_native_mc_class` | 仅搜索类名（去重，用于快速发现） |

## 快速安装（MCP 客户端）

### 前置要求

- **Node.js ≥ 18**

### 第一步：克隆并构建

```bash
git clone https://github.com/SaltfishSheep/AI-MCP-NativeMinecraftMapping.git
cd AI-MCP-NativeMinecraftMapping
npm install
npm run build
```

### 第二步：添加到 MCP 客户端

将以下内容添加到你的 MCP 客户端配置文件中：

**Claude Desktop** (`claude_desktop_config.json`)：

```json
{
  "mcpServers": {
    "native-mc-mapping": {
      "command": "node",
      "args": ["/绝对路径/to/AI-MCP-NativeMinecraftMapping/dist/index.js"]
    }
  }
}
```

**OpenCode** (`opencode.json`)：

```json
{
  "mcp": {
    "native-mc-mapping": {
      "type": "local",
      "command": ["node", "/绝对路径/to/AI-MCP-NativeMinecraftMapping/dist/index.js"],
      "enabled": true
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`)：

```json
{
  "mcpServers": {
    "native-mc-mapping": {
      "command": "node",
      "args": ["/绝对路径/to/AI-MCP-NativeMinecraftMapping/dist/index.js"]
    }
  }
}
```

**Windsurf** (`~/.codeium/windsurf/mcp_config.json`)：

```json
{
  "mcpServers": {
    "native-mc-mapping": {
      "command": "node",
      "args": ["/绝对路径/to/AI-MCP-NativeMinecraftMapping/dist/index.js"]
    }
  }
}
```

> 将 `/绝对路径/to/` 替换为你实际克隆仓库的路径。

## 使用方法

配置完成后，你的 AI 助手可以调用 `search_native_mc` 工具：

```
search_native_mc(mc_version="1.12.2", expression="Entity&Player")
```

**查询示例：**

| 查询 | 描述 |
|------|------|
| `Entity&Player` | 包含 "Entity" 和 "Player" 的条目 |
| `{Block\|Item}&client` | 客户端的 Block 或 Item 条目 |
| `func_70091_d` | 通过 SRG ID 查找特定方法名 |
| `KeyBinding` | 所有提及 KeyBinding 的条目 |
| `m_91087_` | 查找 TSRGv2 方法（1.17+） |
| `motionX\|motionY\|motionZ` | 查找实体速度/动量相关字段 |
| `setVelocity\|addVelocity` | 查找与实体动量相关的方法 |

**表达式语法：**

| 运算符 | 含义 | 示例 |
|--------|------|------|
| `term` | 大小写不敏感的子串匹配 | `KeyBinding` |
| `term:modifier` | 限制匹配范围或类型 | `Potion:class`、`walk:method`、`Z:desc` |
| `&` | 且（两者都必须匹配，优先级更高） | `Entity&Living` |
| `\|` | 或（任一匹配即可） | `Entity\|Player` |
| `{}` | 分组（花括号，避免与 Java 描述符冲突） | `{a\|b}&c` |

**修饰符：**

| 修饰符 | 效果 | 示例 |
|--------|------|------|
| `all` | 搜索所有列（默认） | `Entity:all` |
| `class` | 仅搜索类名 | `Potion:class` |
| `name` | 搜索字段/方法名（仅方法+字段条目） | `Duration:name` |
| `desc` | 仅搜索描述符 | `()Z:desc` |
| `method` | 仅方法条目 | `walk:method` |
| `field` | 仅字段条目 | `health:field` |
| `static` | 仅静态条目 | `get:static` |
| `sideonly` | 仅通用（非侧边特定）条目 | `Entity:sideonly` |

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
  2. [method] aed.bM -> net/minecraft/entity/player/EntityPlayer.applyEntityAttributes  srg=func_110147_ax  desc=()V  sideonly=common
  ...
```

## 项目结构

```
AI-MCP-NativeMinecraftMapping/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # MCP 服务器入口
│   ├── types.ts              # TypeScript 类型定义
│   ├── version-table.ts      # 38 个 MC 版本的 URL 映射表
│   ├── builder/
│   │   ├── index.ts          # buildMappingCache 入口
│   │   ├── download.ts       # HTTP 下载 + 最小 ZIP 读取器
│   │   ├── parsers.ts        # SRG、TSRGv1、TSRGv2、ProGuard、CSV 解析器
│   │   ├── workflows.ts      # 4 种合并工作流构建器
│   │   └── cache.ts          # CSV 缓存写入 + 验证
│   └── search/
│       ├── index.ts          # 重导出
│       ├── expression.ts     # 布尔表达式解析器（AND/OR/括号）
│       └── csv-reader.ts     # CSV 读取 + 分页搜索
├── dist/                     # 构建输出（入口：dist/index.js）
└── .mapping-caches/          # 生成的缓存文件（已 gitignore）
```

## 许可证

MIT 许可证 — 详见 [LICENSE](LICENSE)。

### 第三方数据

- **Mojang 映射** — 根据 [Mojang 自定义许可证](https://account.mojang.com/documents/minecraft_eula) 提供。本服务器在运行时获取它们，**不会**重新分发。
- **MCP 映射** — 由 Mod Coder Pack 社区维护，通过 NeoForge Maven 分发。
