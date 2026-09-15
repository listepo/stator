/** The generator's small IR (plan.md §10 Task 7.3 step 4): header declarations parsed from
 *  the clang JSON AST, before the reverse ABI mapping in `abi.ts` sees them.
 *
 *  Scope rule, stated once: functions are collected from the TARGET header only (a binding
 *  wraps one header; an included helper's functions belong to that helper's binding).
 *  Typedefs, records, and enums are collected GLOBALLY (any file) because a target
 *  signature may spell them (`my_ulong` from an included header must still resolve).
 */

import { isAbsolute, resolve } from 'node:path';
import type { JsonObject } from './ast.ts';
import {
  boolField,
  nodeChildren,
  nodeLoc,
  nodeOffset,
  nodeQualType,
  strField,
  typedefOwnedTagId,
} from './ast.ts';

export interface CParam {
  readonly name: string | undefined;
  readonly cType: string;
}

export interface CFunction {
  readonly cName: string;
  readonly line: number;
  readonly params: readonly CParam[];
  readonly returnType: string;
  readonly variadic: boolean;
  readonly isInline: boolean;
  readonly isStatic: boolean;
  readonly hasBody: boolean;
}

export interface CTypedef {
  readonly name: string;
  /** The sugared spelling (`struct sqlite3`, `unsigned long`) — sugar is what carries
   *  struct-ness and the `size_t` name, so the mapping resolves through it, never the desugared form. */
  readonly underlying: string;
  /** The anonymous struct/union/enum this typedef owns, if any (`typedef struct {...} Point`). */
  readonly anonTagId: string | undefined;
}

export interface CRecord {
  readonly id: string;
  readonly name: string | undefined;
  readonly tag: 'struct' | 'union';
  readonly complete: boolean;
  readonly hasBitfield: boolean;
}

export interface CEnumConstant {
  readonly name: string;
  readonly line: number;
}

export interface CEnum {
  readonly id: string;
  readonly name: string | undefined;
  readonly line: number;
  readonly constants: readonly CEnumConstant[];
}

export interface CMacro {
  readonly name: string;
  readonly line: number;
  readonly functionLike: boolean;
}

export interface CGlobal {
  readonly name: string;
  readonly line: number;
  readonly cType: string;
}

export interface HeaderModel {
  readonly basename: string;
  readonly functions: readonly CFunction[];
  readonly typedefs: ReadonlyMap<string, CTypedef>;
  readonly recordsById: ReadonlyMap<string, CRecord>;
  readonly enums: readonly CEnum[];
  readonly macros: readonly CMacro[];
  readonly globals: readonly CGlobal[];
}

/** Whether this AST node lives in the target header. Clang omits `loc.file` for main-file
 *  nodes (functions, typedefs, fields); included-file nodes always carry it. */
function isTargetFile(locFile: string | undefined, targetPath: string, cwd: string): boolean {
  if (locFile === undefined) {
    return true;
  }
  const base = isAbsolute(targetPath) ? targetPath : resolve(cwd, targetPath);
  const node = isAbsolute(locFile) ? locFile : resolve(cwd, locFile);
  return node === base;
}

function recordOf(node: JsonObject): CRecord | undefined {
  const id = strField(node, 'id');
  if (id === undefined) {
    return undefined;
  }
  const tagUsed = strField(node, 'tagUsed');
  if (tagUsed !== 'struct' && tagUsed !== 'union') {
    return undefined;
  }
  let hasBitfield = false;
  for (const child of nodeChildren(node)) {
    if (strField(child, 'kind') === 'FieldDecl' && boolField(child, 'isBitfield') === true) {
      hasBitfield = true;
    }
  }
  return {
    id,
    name: strField(node, 'name'),
    tag: tagUsed,
    complete: boolField(node, 'completeDefinition') === true,
    hasBitfield,
  };
}

function enumOf(node: JsonObject, lineOf: (child: JsonObject) => number): CEnum | undefined {
  const id = strField(node, 'id');
  if (id === undefined) {
    return undefined;
  }
  const constants: CEnumConstant[] = [];
  for (const child of nodeChildren(node)) {
    if (strField(child, 'kind') !== 'EnumConstantDecl') {
      continue;
    }
    const name = strField(child, 'name');
    if (name !== undefined) {
      constants.push({ name, line: lineOf(child) });
    }
  }
  return { id, name: strField(node, 'name'), line: lineOf(node), constants };
}

/** Collect tag declarations recursively: C nests them (`struct Outer { struct Inner {...} x; }`),
 *  and only the outer one is top-level. Functions cannot nest, so nothing else recurses. */
function collectTags(
  node: JsonObject,
  records: Map<string, CRecord>,
  enums: CEnum[],
  lineOf: (child: JsonObject) => number,
): void {
  const kind = strField(node, 'kind');
  if (kind === 'RecordDecl') {
    const record = recordOf(node);
    if (record !== undefined && !records.has(record.id)) {
      records.set(record.id, record);
    }
  } else if (kind === 'EnumDecl') {
    const found = enumOf(node, lineOf);
    if (found !== undefined && !enums.some((known) => known.id === found.id)) {
      enums.push(found);
    }
  }
  for (const child of nodeChildren(node)) {
    collectTags(child, records, enums, lineOf);
  }
}

const DEFINE_PATTERN = /^\s*#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)(?=\s|\(|$)(.*)$/;
const IFNDEF_PATTERN =
  /^\s*#\s*if(?:ndef\s+([A-Za-z_][A-Za-z0-9_]*)|def\b.*|.*defined\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\))/;

/** Every `#define` in the header text is a refused macro constant (Task 7.3 step 5) — macros
 *  never reach the AST as declarations, so the text scan is the only honest enumeration.
 *  The include guard (`#ifndef FOO_H` / `#define FOO_H`) is not a constant anyone binds; skipped. */
function scanMacros(headerText: string): CMacro[] {
  const macros: CMacro[] = [];
  const lines = headerText.split('\n');
  let guard: string | undefined;
  for (const [index, raw] of lines.entries()) {
    const line = index + 1;
    const guardMatch = IFNDEF_PATTERN.exec(raw);
    if (guardMatch !== null) {
      guard = guardMatch[1] ?? guardMatch[2];
      continue;
    }
    const defineMatch = DEFINE_PATTERN.exec(raw);
    if (defineMatch === null) {
      if (
        raw.trim() !== '' &&
        !raw.trimStart().startsWith('//') &&
        !raw.trimStart().startsWith('/*')
      ) {
        guard = undefined;
      }
      continue;
    }
    const name = defineMatch[1] ?? '';
    const rest = defineMatch[2] ?? '';
    if (guard !== undefined && guard === name) {
      guard = undefined;
      continue;
    }
    guard = undefined;
    macros.push({ name, line, functionLike: rest.startsWith('(') });
  }
  return macros;
}

export function buildModel(
  root: JsonObject,
  headerPath: string,
  headerText: string,
  cwd: string,
): HeaderModel {
  const top = nodeChildren(root);
  const functions: CFunction[] = [];
  const typedefs = new Map<string, CTypedef>();
  const recordsById = new Map<string, CRecord>();
  const enums: CEnum[] = [];
  const globals: CGlobal[] = [];

  // Clang omits `line` for main-file nodes that carry only an offset (typedefs, fields,
  // enumerators) — recover the exact line from the header text. Newline scan once, not per node.
  const lineStarts: number[] = [0];
  for (let at = 0; at < headerText.length; at += 1) {
    if (headerText[at] === '\n') {
      lineStarts.push(at + 1);
    }
  }
  const lineOf = (node: JsonObject): number => {
    const loc = nodeLoc(node);
    if (loc.line > 0) {
      return loc.line;
    }
    const offset = nodeOffset(node);
    if (offset === undefined) {
      return 0;
    }
    let line = 0;
    for (const [index, start] of lineStarts.entries()) {
      if (start > offset) {
        break;
      }
      line = index + 1;
    }
    return line;
  };

  for (const node of top) {
    if (boolField(node, 'isImplicit') === true) {
      continue;
    }
    const kind = strField(node, 'kind');
    const { file } = nodeLoc(node);
    const line = lineOf(node);
    if (kind === 'TypedefDecl') {
      const name = strField(node, 'name');
      const underlying = nodeQualType(node);
      if (name !== undefined && underlying !== undefined && !typedefs.has(name)) {
        typedefs.set(name, { name, underlying, anonTagId: typedefOwnedTagId(node) });
      }
      collectTags(node, recordsById, enums, lineOf);
    } else if (kind === 'RecordDecl' || kind === 'EnumDecl') {
      collectTags(node, recordsById, enums, lineOf);
    } else if (kind === 'FunctionDecl') {
      if (!isTargetFile(file, headerPath, cwd)) {
        continue;
      }
      const cName = strField(node, 'name');
      const qualType = nodeQualType(node);
      if (cName === undefined || qualType === undefined) {
        continue;
      }
      const params: CParam[] = [];
      let hasBody = false;
      for (const child of nodeChildren(node)) {
        const childKind = strField(child, 'kind');
        if (childKind === 'ParmVarDecl') {
          const paramType = nodeQualType(child);
          if (paramType !== undefined) {
            params.push({ name: strField(child, 'name'), cType: paramType });
          }
        } else if (childKind === 'CompoundStmt') {
          hasBody = true;
        }
      }
      // The return spelling is the function type minus its trailing parameter list.
      // Safe: any function-pointer parens elsewhere already refuse the function first.
      const returnType = qualType.replace(/\s*\([^()]*\)\s*$/, '').trim();
      functions.push({
        cName,
        line,
        params,
        returnType,
        variadic: boolField(node, 'variadic') === true,
        isInline: boolField(node, 'inline') === true,
        isStatic: strField(node, 'storageClass') === 'static',
        hasBody,
      });
    } else if (kind === 'VarDecl') {
      if (!isTargetFile(file, headerPath, cwd)) {
        continue;
      }
      const cName = strField(node, 'name');
      const qualType = nodeQualType(node);
      if (cName !== undefined && qualType !== undefined) {
        globals.push({ name: cName, line, cType: qualType });
      }
    }
  }

  const slash = Math.max(headerPath.lastIndexOf('/'), headerPath.lastIndexOf('\\'));
  const basename = slash === -1 ? headerPath : headerPath.slice(slash + 1);
  return {
    basename,
    functions,
    typedefs,
    recordsById,
    enums,
    macros: scanMacros(headerText),
    globals,
  };
}
