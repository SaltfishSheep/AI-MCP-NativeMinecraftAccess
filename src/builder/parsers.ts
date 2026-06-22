import { SIDE_MAP } from '../types.js';

// ============================================================================
// SRG Parser (1.7.10 - 1.11.2)
// ============================================================================

interface SrgMethodInfo {
  deobf_class: string;
  obf_class: string;
  obf_name: string;
  descriptor: string;
}

interface SrgFieldInfo {
  obf_class: string;
  obf_name: string;
  deobf_class: string;
}

export interface SrgParseResult {
  methods: Map<string, SrgMethodInfo>;
  fields: Map<string, SrgFieldInfo>;
}

/**
 * Parse SRG format (1.7.10 - 1.11.2).
 *
 * Format:
 *   PK: . net/minecraft/src
 *   CL: a net/minecraft/util/EnumChatFormatting
 *   FD: bdb/w net/minecraft/client/gui/GuiCreateWorld/field_146337_w
 *   MD: als/b ()I net/minecraft/block/BlockLadder/func_149645_b ()I
 *
 * Returns:
 *   - methods: srg_name -> { deobf_class, obf_class, obf_name, descriptor }
 *   - fields: srg_name -> { obf_class, obf_name, deobf_class }
 */
export function parseSrg(content: string): SrgParseResult {
  const methods = new Map<string, SrgMethodInfo>();
  const fields = new Map<string, SrgFieldInfo>();

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;

    const prefix = parts[0];

    if (prefix === 'CL:') {
      // Class mapping - not stored separately, embedded in FD/MD lines
      continue;
    }

    if (prefix === 'FD:') {
      // Field mapping: FD: <obf_class>/<obf_field> <deobf_class>/<srg_field>
      if (parts.length >= 3) {
        const obfFull = parts[1];
        const deobfFull = parts[2];

        let obfClass: string;
        let obfField: string;
        const obfSlash = obfFull.indexOf('/');
        if (obfSlash !== -1) {
          obfClass = obfFull.substring(0, obfSlash);
          obfField = obfFull.substring(obfSlash + 1);
        } else {
          obfClass = '';
          obfField = obfFull;
        }

        let deobfClass: string;
        let srgName: string;
        const deobfSlash = deobfFull.lastIndexOf('/');
        if (deobfSlash !== -1) {
          deobfClass = deobfFull.substring(0, deobfSlash);
          srgName = deobfFull.substring(deobfSlash + 1);
        } else {
          deobfClass = '';
          srgName = deobfFull;
        }

        fields.set(srgName, { obf_class: obfClass, obf_name: obfField, deobf_class: deobfClass });
      }
      continue;
    }

    if (prefix === 'MD:') {
      // Method mapping: MD: <obf_class>/<obf_method> <obf_desc> <deobf_class>/<srg_method> <srg_desc>
      if (parts.length >= 5) {
        const obfFull = parts[1];
        const obfDesc = parts[2];
        const deobfFull = parts[3];
        // parts[4] is srg_desc (same as obf_desc in practice)

        let obfClass: string;
        let obfMethod: string;
        const obfSlash = obfFull.indexOf('/');
        if (obfSlash !== -1) {
          obfClass = obfFull.substring(0, obfSlash);
          obfMethod = obfFull.substring(obfSlash + 1);
        } else {
          obfClass = '';
          obfMethod = obfFull;
        }

        let deobfClass: string;
        let srgName: string;
        const deobfSlash = deobfFull.lastIndexOf('/');
        if (deobfSlash !== -1) {
          deobfClass = deobfFull.substring(0, deobfSlash);
          srgName = deobfFull.substring(deobfSlash + 1);
        } else {
          deobfClass = '';
          srgName = deobfFull;
        }

        methods.set(srgName, {
          deobf_class: deobfClass,
          obf_class: obfClass,
          obf_name: obfMethod,
          descriptor: obfDesc,
        });
      }
      continue;
    }
  }

  return { methods, fields };
}

// ============================================================================
// TSRGv1 Parser (1.12.2 - 1.16.5)
// ============================================================================

interface Tsrgv1MethodInfo {
  deobf_class: string;
  obf_class: string;
  obf_name: string;
  descriptor: string;
}

interface Tsrgv1FieldInfo {
  obf_class: string;
  obf_name: string;
}

export interface Tsrgv1ParseResult {
  methods: Map<string, Tsrgv1MethodInfo>;
  /** Keyed by `obf_class\0mojang_name` (since JS doesn't have tuple keys) */
  fields: Map<string, Tsrgv1FieldInfo>;
}

/**
 * Parse TSRGv1 format (1.12.2 - 1.16.5).
 *
 * Returns:
 *   - methods: srg_name -> { deobf_class, obf_class, obf_name, descriptor }
 *   - fields: `${obf_class}\0${mojang_name}` -> { obf_class, obf_name }
 */
export function parseTsrgv1(content: string): Tsrgv1ParseResult {
  const methods = new Map<string, Tsrgv1MethodInfo>();
  const fields = new Map<string, Tsrgv1FieldInfo>();

  let currentObfClass: string | null = null;
  let currentDeobfClass: string | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check indentation: indented lines are members
    if (line.startsWith('\t') || line.startsWith('    ')) {
      const parts = trimmed.split(/\s+/);
      if (parts.length === 0) continue;

      // Check if this is a method (has descriptor with parentheses)
      let isMethod = false;
      for (const part of parts) {
        if (part.includes('(') && part.includes(')')) {
          isMethod = true;
          break;
        }
      }

      if (isMethod) {
        // Method: <obf> <descriptor> <srg_name>
        if (parts.length >= 3) {
          const obfName = parts[0];
          let descriptor = '';
          let srgName = '';

          for (let j = 1; j < parts.length; j++) {
            if (parts[j].includes('(') && parts[j].includes(')')) {
              descriptor = parts[j];
              if (j + 1 < parts.length) {
                srgName = parts[j + 1];
              }
              break;
            }
          }

          if (srgName) {
            methods.set(srgName, {
              deobf_class: currentDeobfClass ?? '',
              obf_class: currentObfClass ?? '',
              obf_name: obfName,
              descriptor,
            });
          }
        }
      } else {
        // Field: <obf> <mojang_name>
        if (parts.length >= 2) {
          const obfName = parts[0];
          const mojangName = parts[1];
          if (currentObfClass) {
            const key = `${currentObfClass}\0${mojangName}`;
            fields.set(key, { obf_class: currentObfClass, obf_name: obfName });
          }
        }
      }
    } else {
      // Class line: <obf_class> <mojang_class_path>
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        currentObfClass = parts[0];
        currentDeobfClass = parts[1];
      }
    }
  }

  return { methods, fields };
}

// ============================================================================
// TSRGv2 Parser (1.17+)
// ============================================================================

interface Tsrgv2Entry {
  obf_class: string;
  obf_name: string;
  descriptor: string;
  srg_name: string;
  type: 'field' | 'method';
  is_static: boolean;
}

/**
 * Parse TSRGv2 format (1.17+).
 *
 * Format:
 *   <obf_class> <srg_class_path> <srg_class_id>
 *       <obf_field> <srg_field> <srg_id>                    # Field (3 parts)
 *       <obf_method> <descriptor> <srg_method> <srg_id>      # Method (4 parts, descriptor starts with '(')
 *           static                                           # Optional static marker
 *           <param_index> o <param_srg> <param_id>           # Parameter lines (skip)
 *
 * Returns list of entries.
 */
export function parseTsrgv2(content: string): Tsrgv2Entry[] {
  const entries: Tsrgv2Entry[] = [];

  let currentObfClass: string | null = null;
  // currentSrgClass is not used in entries but tracked for correctness
  // let currentSrgClass: string | null = null;

  const lines = content.split('\n');
  let i = 0;

  // Skip header line if present
  if (lines.length > 0 && lines[0].startsWith('tsrg2')) {
    i = 1;
  }

  while (i < lines.length) {
    const line = lines[i];
    i++;

    const trimmed = line.trim();
    if (!trimmed) continue;

    // Calculate indent level
    const indent = line.length - line.trimStart().length;

    if (indent === 0) {
      // Class line: <obf_class> <srg_class_path> <srg_class_id>
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        currentObfClass = parts[0];
        // currentSrgClass = parts[1];
      }
      continue;
    }

    if (currentObfClass === null) continue;

    // Member line
    const parts = trimmed.split(/\s+/);
    if (parts.length === 0) continue;

    // Check for static sub-line
    let isStatic = false;
    if (i < lines.length) {
      const nextLine = lines[i].trim();
      if (nextLine === 'static') {
        isStatic = true;
        i++;
      }
    }

    // Skip parameter sub-lines (digit-prefixed lines at deeper indent)
    while (i < lines.length) {
      const nextLine = lines[i];
      const nextIndent = nextLine.length - nextLine.trimStart().length;
      if (nextIndent > indent) {
        const nextParts = nextLine.trim().split(/\s+/);
        if (nextParts.length > 0 && /^\d+$/.test(nextParts[0])) {
          i++;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    // Determine if method or field
    // Methods have descriptor starting with '(' as the second part
    if (parts.length >= 2 && parts[1].startsWith('(')) {
      // Method: <obf> <descriptor> <srg_name> <srg_id>
      if (parts.length >= 3) {
        entries.push({
          obf_class: currentObfClass,
          obf_name: parts[0],
          descriptor: parts[1],
          srg_name: parts[2],
          type: 'method',
          is_static: isStatic,
        });
      }
    } else {
      // Field: <obf> <srg_name> <srg_id>
      if (parts.length >= 2) {
        entries.push({
          obf_class: currentObfClass,
          obf_name: parts[0],
          descriptor: '',
          srg_name: parts[1],
          type: 'field',
          is_static: isStatic,
        });
      }
    }
  }

  return entries;
}

// ============================================================================
// ProGuard Parser (1.17+)
// ============================================================================

interface ProguardEntry {
  deobf_class: string;
  obf_class: string;
  obf_name: string;
  deobf_name: string;
  descriptor: string;
  type: 'field' | 'method';
}

/**
 * Parse ProGuard format (used in 1.16.x legacy_proguard and 1.17+ modern workflows).
 *
 * Format:
 *   <MojangName> -> <ObfName>:
 *       returnType name(params) -> obfName
 *       type name -> obfName
 */
export function parseProguard(content: string): ProguardEntry[] {
  const entries: ProguardEntry[] = [];

  let currentDeobfClass: string | null = null;
  let currentObfClass: string | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Check indentation
    if (line.startsWith(' ') || line.startsWith('\t')) {
      // Member line
      const arrowPos = trimmed.lastIndexOf(' -> ');
      if (arrowPos === -1) continue;

      const memberPart = trimmed.substring(0, arrowPos).trim();
      const obfName = trimmed.substring(arrowPos + 4).trim();

      if (memberPart.includes('(')) {
        // Method: returnType name(params) -> obfName
        const parenStart = memberPart.indexOf('(');
        const beforeParen = memberPart.substring(0, parenStart).trim();
        const parts = beforeParen.split(/\s+/);
        if (parts.length < 2) continue;

        const _returnType = parts[0];
        const methodName = parts[1];

        entries.push({
          deobf_class: currentDeobfClass ?? '',
          obf_class: currentObfClass ?? '',
          obf_name: obfName,
          deobf_name: methodName,
          descriptor: '',
          type: 'method',
        });
      } else {
        // Field: type name -> obfName
        const parts = memberPart.split(/\s+/);
        if (parts.length >= 2) {
          const _fieldType = parts[0];
          const fieldName = parts[1];

          entries.push({
            deobf_class: currentDeobfClass ?? '',
            obf_class: currentObfClass ?? '',
            obf_name: obfName,
            deobf_name: fieldName,
            descriptor: '',
            type: 'field',
          });
        }
      }
    } else {
      // Class line: <MojangName> -> <ObfName>:
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 3 && parts[1] === '->') {
        currentDeobfClass = parts[0].replace(/\./g, '/');
        currentObfClass = parts[2].replace(/:$/, '');
      }
    }
  }

  return entries;
}

// ============================================================================
// MCP CSV Parser (fields.csv / methods.csv)
// ============================================================================

interface McpCsvEntry {
  searge: string;
  name: string;
  side: string;
  desc: string;
}

/**
 * Parse MCP CSV format (fields.csv or methods.csv).
 *
 * CSV with columns: searge, name, side, desc
 */
export function parseMcpCsv(content: string): McpCsvEntry[] {
  const entries: McpCsvEntry[] = [];

  const lines = content.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return entries;

  // Parse header
  const header = parseCsvLine(lines[0]);
  const seargeIdx = header.indexOf('searge');
  const nameIdx = header.indexOf('name');
  const sideIdx = header.indexOf('side');
  const descIdx = header.indexOf('desc');

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    entries.push({
      searge: seargeIdx >= 0 && seargeIdx < cols.length ? cols[seargeIdx] : '',
      name: nameIdx >= 0 && nameIdx < cols.length ? cols[nameIdx] : '',
      side: sideIdx >= 0 && sideIdx < cols.length ? cols[sideIdx] : '',
      desc: descIdx >= 0 && descIdx < cols.length ? cols[descIdx] : '',
    });
  }

  return entries;
}

/**
 * Parse a single CSV line, handling quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          // Escaped quote
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

// ============================================================================
// static_methods.txt Parser
// ============================================================================

/**
 * Parse static_methods.txt - one SRG method name per line.
 * Strips trailing underscores for matching.
 */
export function parseStaticMethods(content: string): Set<string> {
  const result = new Set<string>();
  for (const line of content.split('\n')) {
    const name = line.trim();
    if (name) {
      // Strip trailing underscore for matching
      result.add(name.replace(/_+$/, ''));
    }
  }
  return result;
}

// ============================================================================
// constructors Parser
// ============================================================================

interface ConstructorEntry {
  srg_id: string;
  class_path: string;
  descriptor: string;
}

/**
 * Parse constructors file.
 * Format: <srg_id> <class_path> <descriptor>
 */
export function parseConstructors(content: string): ConstructorEntry[] {
  const entries: ConstructorEntry[] = [];
  for (const line of content.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 3) {
      entries.push({
        srg_id: parts[0],
        class_path: parts[1],
        descriptor: parts[2],
      });
    }
  }
  return entries;
}
