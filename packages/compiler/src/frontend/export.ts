/** Task 7.2 steps 1–2: the export surface behind `--emit-header` (docs/FFI.md §8, plan.md
 * §10).
 *
 * The ONLY module that reads the export surface for the header: which entry-file declarations
 * are C-visible, how each signature position spells in C, and which shapes are refused. Like
 * `extern.ts`, `ts.Type` never leaves this file — callers get plain C spellings plus
 * `docs/DIAGNOSTICS.md` diagnostics.
 *
 * One table, two directions (Task 7.2 step 1): positions map through `exportAbiKindOf`, the
 * export direction of Task 7.1's ABI table. In-table stays a plain C type; anything else is
 * `jsrt_value` — a fallback, never a refusal. Refusals (STA1122–STA1124) answer declaration
 * SHAPES, not positions: a class, a closure, a generic, mutable state, and C-symbol
 * collisions. Only the entry file is scanned: re-exported names stay STA1122 in v0.
 */

import * as ts from 'typescript';
import type { ExternAbiKind } from '../hir/nodes.ts';
import { diagnosticFromNode, type Diagnostic } from '../support/diagnostics.ts';
import { exportAbiKindOf } from './extern.ts';
import { tsTypeToHType } from './types.ts';

type Mode = 'ts' | 'js';

export interface ExportedParam {
  readonly name: string;
  readonly cType: string;
}

export interface ExportedFunction {
  readonly name: string;
  readonly cName: string;
  readonly params: readonly ExportedParam[];
  readonly ret: string;
}

export interface ExportedConst {
  readonly name: string;
  readonly cName: string;
  readonly cType: string;
}

export interface UnitExports {
  readonly unit: string;
  readonly functions: readonly ExportedFunction[];
  readonly consts: readonly ExportedConst[];
  readonly diagnostics: readonly Diagnostic[];
  readonly needsBool: boolean;
  readonly needsJsrtValue: boolean;
}

/** A raw entry spelling made a safe C identifier: anything outside `[A-Za-z0-9_]` becomes `_`.
 * Total — every TS name, including `$`-led and non-ASCII ones, lands somewhere spellable. */
function sanitizeCIdentifier(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, '_');
  if (cleaned === '' || /^[0-9]/.test(cleaned)) {
    return `_${cleaned}`;
  }
  return cleaned;
}

/** The default `--unit-name`: the entry's file basename without its extension, sanitized.
 * The program stores entry names with forward slashes whatever the host spells (build.ts), so
 * splitting on both separators keeps this total on Windows checkouts too. */
export function defaultUnitName(entryPath: string): string {
  const base = entryPath.split(/[\\/]/).pop() ?? entryPath;
  return sanitizeCIdentifier(base.replace(/\.[^.]*$/, ''));
}

/** A raw `--unit-name` (or default) made safe to embed: only the character set is fixed —
 * unlike a declaration name, a unit never starts an identifier (`stator_` precedes it), so a
 * leading digit needs no underscore. Idempotent, so the already-sanitized default passes
 * through unchanged. Applied once at the build boundary, so every embedder below — the
 * mangling, the guard macro — can assume it. */
export function sanitizeUnitName(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, '_');
  return cleaned === '' ? '_' : cleaned;
}

/** The C name of an export (plan §10 Task 7.2 step 7): `stator_<unit>_<name>`. The unit is
 * already sanitized; the name is sanitized here so the mangling is total. */
export function exportCName(unit: string, name: string): string {
  return `stator_${unit}_${sanitizeCIdentifier(name)}`;
}

/** C keywords a TS parameter name may legally spell (`function f(int: number)`): emitted
 * verbatim such a prototype would not compile, so the name gains a leading underscore. Export
 * and function names never need this — the `stator_<unit>_` prefix cannot be a keyword. */
const C_KEYWORDS: ReadonlySet<string> = new Set([
  'auto',
  'break',
  'case',
  'char',
  'const',
  'continue',
  'default',
  'do',
  'double',
  'else',
  'enum',
  'extern',
  'float',
  'for',
  'goto',
  'if',
  'inline',
  'int',
  'long',
  'register',
  'restrict',
  'return',
  'short',
  'signed',
  'sizeof',
  'static',
  'struct',
  'switch',
  'typedef',
  'union',
  'unsigned',
  'void',
  'volatile',
  'while',
  '_Bool',
  '_Complex',
  '_Imaginary',
  '_Alignas',
  '_Alignof',
  '_Atomic',
  '_Static_assert',
  '_Noreturn',
  '_Thread_local',
  '_Generic',
  'bool',
  'true',
  'false',
]);

function exportParamName(raw: string): string {
  const cleaned = sanitizeCIdentifier(raw);
  return C_KEYWORDS.has(cleaned) ? `_${cleaned}` : cleaned;
}

/** The C type one ABI kind crosses as in the export direction: Task 7.1's table read
 * outwards. A `cstring` return stays `const char *` — unlike the 7.1 forward declarations
 * (codegen's `externCReturnType`), which must spell a third-party header's `char *`
 * identically, this header owns both sides, so the contract's `const` is what is printed. */
function abiCType(kind: ExternAbiKind, position: 'param' | 'return'): string {
  switch (kind) {
    case 'number':
      return 'double';
    case 'boolean':
      return 'bool';
    case 'cstring':
    case 'cstring-owned':
      return 'const char *';
    case 'pointer':
      return 'void *';
    case 'void':
      return position === 'return' ? 'void' : 'jsrt_value';
  }
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true
  );
}

function hasDefaultModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) === true
  );
}

function isConstList(list: ts.VariableDeclarationList): boolean {
  return (list.flags & ts.NodeFlags.Const) !== 0;
}

class Collector {
  readonly functions: ExportedFunction[] = [];
  readonly consts: ExportedConst[] = [];
  readonly diagnostics: Diagnostic[] = [];
  readonly seen = new Map<string, string>();
  needsBool = false;
  needsJsrtValue = false;
  readonly sourceFile: ts.SourceFile;
  readonly checker: ts.TypeChecker;
  readonly unit: string;
  readonly mode: Mode;

  constructor(sourceFile: ts.SourceFile, checker: ts.TypeChecker, unit: string, mode: Mode) {
    this.sourceFile = sourceFile;
    this.checker = checker;
    this.unit = unit;
    this.mode = mode;
  }

  note(cType: string): void {
    if (cType === 'bool') {
      this.needsBool = true;
    }
    if (cType === 'jsrt_value') {
      this.needsJsrtValue = true;
    }
  }

  /** Claim a C symbol for a TS export, or refuse the collision (STA1124): two exports
   * mangling to one symbol is a compile error, never last-writer-wins (Task 7.2 step 7). */
  claim(name: string, node: ts.Node): string | undefined {
    const cName = exportCName(this.unit, name);
    const owner = this.seen.get(cName);
    if (owner !== undefined) {
      this.diagnostics.push(
        diagnosticFromNode(
          node,
          this.sourceFile,
          'STA1124',
          'never',
          this.mode,
          `exported '${name}' collides with exported '${owner}' on the C symbol ` +
            `'${cName}' — rename one; a collision is a compile error, never last-wins ` +
            '(docs/FFI.md)',
        ),
      );
      return undefined;
    }
    this.seen.set(cName, name);
    return cName;
  }

  never(node: ts.Node, code: string, message: string): void {
    this.diagnostics.push(
      diagnosticFromNode(node, this.sourceFile, code, 'never', this.mode, message),
    );
  }
}

/** One function parameter through the table: the C spelling, or `jsrt_value` outside it.
 * A rest parameter has no C arity to spell, so it is STA1122 rather than a fallback — a
 * fallback prototype would claim a shape the stub could never fill. */
function exportParamType(collector: Collector, param: ts.ParameterDeclaration): string | undefined {
  if (param.dotDotDotToken !== undefined) {
    collector.never(
      param,
      'STA1122',
      'exported function with a rest parameter cannot be exposed to C in v0 — ' +
        'C has no rest arity (docs/FFI.md)',
    );
    return undefined;
  }
  if (!ts.isIdentifier(param.name)) {
    collector.never(
      param.name,
      'STA1122',
      'exported function with a destructured parameter cannot be exposed to C in v0 — ' +
        'every C parameter needs a name (docs/FFI.md)',
    );
    return undefined;
  }
  const kind = exportAbiKindOf(
    collector.checker.getTypeAtLocation(param),
    collector.checker,
    'param',
  );
  return kind === undefined ? 'jsrt_value' : abiCType(kind, 'param');
}

function collectFunction(
  collector: Collector,
  decl: ts.FunctionDeclaration,
  name: string,
  nameNode: ts.Identifier,
): void {
  if (decl.typeParameters !== undefined && decl.typeParameters.length > 0) {
    collector.never(
      nameNode,
      'STA1122',
      `exported function '${name}' is generic and has no single C signature — ` +
        'generics are not exported in v0 (docs/FFI.md)',
    );
    return;
  }
  const cTypes: string[] = [];
  for (const param of decl.parameters) {
    const cType = exportParamType(collector, param);
    if (cType === undefined) {
      return;
    }
    cTypes.push(cType);
  }
  const signature = collector.checker.getSignatureFromDeclaration(decl);
  if (signature === undefined) {
    collector.never(
      nameNode,
      'STA1122',
      `exported function '${name}' has no call signature, so there is no C prototype ` +
        'to emit (docs/FFI.md)',
    );
    return;
  }
  const retKind = exportAbiKindOf(signature.getReturnType(), collector.checker, 'return');
  const ret = retKind === undefined ? 'jsrt_value' : abiCType(retKind, 'return');
  const cName = collector.claim(name, nameNode);
  if (cName === undefined) {
    return;
  }
  const params: ExportedParam[] = decl.parameters.map((param, index) => ({
    // Destructured and rest parameters returned above, so every name here is an identifier;
    // the index guards nothing and exists only for the type the map callback must return.
    name: exportParamName(ts.isIdentifier(param.name) ? param.name.text : `arg${String(index)}`),
    cType: cTypes[index] ?? 'jsrt_value',
  }));
  for (const param of params) {
    collector.note(param.cType);
  }
  collector.note(ret);
  collector.functions.push({ name, cName, params, ret });
}

/** One `export const` declarator: number/boolean spell their C type, a `CString` spells the
 * contract's `const char *`, a string spells `jsrt_value` (bare `string` is deliberately not
 * in the table — docs/FFI.md §2), and anything wider is mutable module state (STA1123). */
function collectConst(
  collector: Collector,
  decl: ts.VariableDeclaration,
  list: ts.VariableDeclarationList,
): void {
  const at = decl.name;
  if (!isConstList(list)) {
    collector.never(
      at,
      'STA1123',
      `exported '${decl.name.getText(collector.sourceFile)}' is mutable module state and ` +
        'cannot be exposed to C in v0 — only const primitives are exportable (docs/FFI.md)',
    );
    return;
  }
  if (!ts.isIdentifier(decl.name)) {
    collector.never(
      at,
      'STA1123',
      'exported destructured state cannot be exposed to C in v0 — only a named const ' +
        'primitive is exportable (docs/FFI.md)',
    );
    return;
  }
  const name = decl.name.text;
  const initializer = decl.initializer;
  if (initializer === undefined) {
    collector.never(
      at,
      'STA1123',
      `exported const '${name}' has no initializer, so there is no value to expose ` +
        '(docs/FFI.md)',
    );
    return;
  }
  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
    collector.never(
      at,
      'STA1122',
      `exported const '${name}' holds a function and cannot be exposed to C in v0 — ` +
        'export a function declaration instead; C cannot hold captured state (docs/FFI.md)',
    );
    return;
  }
  if (ts.isClassExpression(initializer)) {
    collector.never(
      at,
      'STA1122',
      `exported const '${name}' holds a class and cannot be exposed to C in v0 — ` +
        'classes are not exported in v0 (docs/FFI.md)',
    );
    return;
  }
  const type = collector.checker.getTypeAtLocation(decl);
  const kind = exportAbiKindOf(type, collector.checker, 'return');
  let cType: string | undefined;
  if (kind === 'number' || kind === 'boolean' || kind === 'cstring') {
    cType = abiCType(kind, 'return');
  } else {
    const hType = tsTypeToHType(type, collector.checker);
    cType =
      hType.kind === 'string' || hType.kind === 'null' || hType.kind === 'undefined'
        ? 'jsrt_value'
        : undefined;
  }
  if (cType === undefined) {
    collector.never(
      at,
      'STA1123',
      `exported const '${name}' is not a primitive and cannot be exposed to C in v0 — ` +
        'mutable module state has no C representation (docs/FFI.md)',
    );
    return;
  }
  const cName = collector.claim(name, at);
  if (cName === undefined) {
    return;
  }
  collector.note(cType);
  collector.consts.push({ name, cName, cType });
}

/** The entry file's C-visible set, in source order — source order is the determinism: no
 * timestamps, no paths, no hash-ordered iteration (Task 7.2 step 8). Overload signatures
 * (bodiless declarations) are skipped: the implementation carries the export, and a group
 * whose implementation lacks the modifier still exports when any overload carries it. */
export function collectUnitExports(
  entryFile: ts.SourceFile,
  checker: ts.TypeChecker,
  unit: string,
  mode: Mode,
): UnitExports {
  const collector = new Collector(entryFile, checker, unit, mode);
  const overloadExported = new Set<string>();
  for (const statement of entryFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.body === undefined &&
      statement.name !== undefined &&
      hasExportModifier(statement)
    ) {
      overloadExported.add(statement.name.text);
    }
  }
  for (const statement of entryFile.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      if (statement.name === undefined || hasDefaultModifier(statement)) {
        if (hasExportModifier(statement) || hasDefaultModifier(statement)) {
          collector.never(
            statement,
            'STA1122',
            'export default cannot be exposed to C in v0 — C needs a stable name; ' +
              'export a named declaration instead (docs/FFI.md)',
          );
        }
        continue;
      }
      const name = statement.name.text;
      const exported = hasExportModifier(statement) || overloadExported.has(name);
      if (!exported) {
        continue;
      }
      if (statement.body === undefined) {
        continue;
      }
      collectFunction(collector, statement, name, statement.name);
    } else if (ts.isVariableStatement(statement)) {
      if (!hasExportModifier(statement)) {
        continue;
      }
      for (const decl of statement.declarationList.declarations) {
        collectConst(collector, decl, statement.declarationList);
      }
    } else if (ts.isClassDeclaration(statement)) {
      if (!hasExportModifier(statement)) {
        continue;
      }
      const name = statement.name === undefined ? 'anonymous' : `'${statement.name.text}'`;
      collector.never(
        statement.name ?? statement,
        'STA1122',
        `exported class ${name} cannot be exposed to C in v0 — classes are not ` +
          'exported in v0 (docs/FFI.md)',
      );
    } else if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) {
      collector.never(
        statement,
        'STA1122',
        're-exported and default-exported names cannot be exposed to C in v0 — ' +
          'export the declaration directly (docs/FFI.md)',
      );
    } else if (hasExportModifier(statement)) {
      collector.never(
        statement,
        'STA1122',
        `exported ${ts.SyntaxKind[statement.kind]} cannot be exposed to C in v0 — only ` +
          'non-generic function declarations and const primitives are exportable (docs/FFI.md)',
      );
    }
  }
  return {
    unit,
    functions: collector.functions,
    consts: collector.consts,
    diagnostics: collector.diagnostics,
    needsBool: collector.needsBool,
    needsJsrtValue: collector.needsJsrtValue,
  };
}

/** The header text: byte-identical for the same input (Task 7.2 step 8) — declarations in
 * source order, LF newlines, no timestamps, no paths. Stubs and `stator_init_<unit>` arrive
 * with steps 3–5; this header declares only what the object already defines the shape of. */
export function renderHeader(exports: UnitExports): string {
  const guard = `STATOR_${exports.unit.toUpperCase()}_H`;
  const lines: string[] = [
    `#ifndef ${guard}`,
    `#define ${guard}`,
    '',
    '/* Generated by `stator build --emit-header`: the C ABI view of ' +
      `unit \`${exports.unit}\`'s exports.`,
    ' * An exported function whose whole signature is in the ABI table spells plain C types;',
    ' * any other position crosses as jsrt_value (docs/FFI.md). v0 is single-threaded:',
    ' * calling in from a second thread is undefined behavior. */',
    '',
  ];
  if (exports.needsBool) {
    lines.push('#include <stdbool.h>');
  }
  if (exports.needsJsrtValue) {
    lines.push('#include "jsrt_value.h"');
  }
  if (exports.needsBool || exports.needsJsrtValue) {
    lines.push('');
  }
  for (const fn of exports.functions) {
    const params = fn.params.map((p) => `${p.cType} ${p.name}`).join(', ');
    lines.push(`${fn.ret} ${fn.cName}(${fn.params.length === 0 ? 'void' : params});`);
  }
  for (const constant of exports.consts) {
    lines.push(`extern const ${constant.cType} ${constant.cName};`);
  }
  lines.push('', '#endif', '');
  return lines.join('\n');
}
