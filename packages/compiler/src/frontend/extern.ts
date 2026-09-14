/** `@statorExtern` declarations and the ABI-table classification (docs/FFI.md §§1–2, 4).
 *
 * The ONLY module that reads the extern surface: the marker tags, the C-symbol override, the
 * `@statorError` convention, and the per-position kind mapping. The gate (`gate.ts`) and the
 * lowering (`lower/index.ts`) both read it, which is what keeps a signature the gate accepts
 * lowerable — widening one without the other is the STA4031 the gate invariant exists to prevent.
 *
 * `ts.Type` never leaves this file (AGENTS.md): callers get `ExternSignature` (plain kinds) or
 * a refusal `{code, message}` naming a `docs/DIAGNOSTICS.md` code.
 */

import * as ts from 'typescript';
import type { ExternAbiKind, ExternErrorConvention } from '../hir/nodes.ts';
import { externConventionMismatch, isExternErrorConvention } from '../hir/nodes.ts';
import { hTypeName } from '../hir/types.ts';
import { tsTypeToHType } from './types.ts';

export interface ExternSignature {
  /** What the program spelled — what the error-convention throw reports. */
  readonly tsName: string;
  /** The C symbol the emitter calls — the `@statorExtern` override, or the TS name. */
  readonly cName: string;
  /** One C-ABI kind per declared parameter. Never `void` (refused) and never short: the gate
   * refuses an arity mismatch, so the lowering may index this by argument position. */
  readonly params: readonly ExternAbiKind[];
  readonly ret: ExternAbiKind;
  readonly error: ExternErrorConvention | undefined;
}

export type ExternClassified =
  | { readonly ok: true; readonly signature: ExternSignature }
  // `code` is STA1114–STA1121 (never) for design limits, STA1217 (not-yet, phase 7) for table
  // types whose lowering is not in steps 4–5 (branded pointers ride with step 6 ownership).
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
      readonly phase?: number;
    };

/** The JSDoc surface of one extern declaration: the C-symbol override (or `undefined` for the
 * TS name) and every `@statorError` spelling. `undefined` means "no marker, not an extern". */
interface ExternMarker {
  readonly cName: string | undefined;
  readonly errors: readonly string[];
}

/** The comment text of a JSDoc tag, flattened. A tag's comment is a string, a node, or a mix;
 * only the text matters here (a symbol name, a convention word), so node structure is dropped. */
function jsdocText(comment: ts.JSDocTag['comment']): string | undefined {
  if (comment === undefined) {
    return undefined;
  }
  if (typeof comment === 'string') {
    return comment;
  }
  let text = '';
  for (const part of comment) {
    if (typeof part === 'string') {
      text += part;
    } else {
      text += part.getText();
    }
  }
  return text;
}

function markerOf(decl: ts.FunctionDeclaration): ExternMarker | undefined {
  let found = false;
  let cName: string | undefined;
  const errors: string[] = [];
  for (const tag of ts.getJSDocTags(decl)) {
    const name = tag.tagName.text;
    if (name === 'statorExtern') {
      found = true;
      if (cName === undefined) {
        // One marker, one override position (docs/FFI.md §1): the first token of the tag text.
        const first = jsdocText(tag.comment)?.trim().split(/\s+/, 1)[0];
        cName = first === undefined || first === '' ? undefined : first;
      }
    } else if (name === 'statorError') {
      const convention = jsdocText(tag.comment)?.trim();
      errors.push(convention ?? '');
    }
  }
  return found ? { cName, errors } : undefined;
}

/** Whether this declaration carries the extern marker — the one test every stage shares. Only
 * a `declare function` in a `.d.ts` is a legal extern (STA1121 otherwise); the placement check
 * reads the declaration's own file, so callers never need the caller's. */
export function isExternDeclaration(node: ts.Node): node is ts.FunctionDeclaration {
  return ts.isFunctionDeclaration(node) && markerOf(node) !== undefined;
}

/** The extern declaration a symbol resolves to, following a single import/export alias hop
 * to the `.d.ts` declaration that carries the marker. `undefined` for an ordinary symbol. */
export function externDeclarationOfSymbol(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
): ts.FunctionDeclaration | undefined {
  if (symbol === undefined) {
    return undefined;
  }
  const declarations = symbol.declarations ?? [];
  const direct = declarations.find((decl): decl is ts.FunctionDeclaration =>
    isExternDeclaration(decl),
  );
  if (direct !== undefined) {
    return direct;
  }
  // An extern re-exported through a module `.d.ts`: the call site names the alias, the marker
  // lives on the target. One hop only — a chain of re-exports of a C symbol is not a surface.
  if (declarations.some((decl) => ts.isImportSpecifier(decl) || ts.isExportSpecifier(decl))) {
    const target = checker.getAliasedSymbol(symbol);
    return target.declarations?.find((decl): decl is ts.FunctionDeclaration =>
      isExternDeclaration(decl),
    );
  }
  return undefined;
}

/** The extern declaration a call resolves to, or `undefined` for an ordinary call.
 *
 * Externs are bare identifiers (a `.d.ts` ambient has no namespace to hang a property off),
 * parenthesized or not. Anything else — a property access, a `super` call — is decided by the
 * arm that owns that shape, never here. Overloads resolve to the first MARKED declaration: the
 * surface is one C symbol per TS name, so overloads of an extern are a user error the arity
 * rule answers, not a second signature. */
export function externDeclarationOfCall(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
): ts.FunctionDeclaration | undefined {
  let callee: ts.Expression = call.expression;
  while (ts.isParenthesizedExpression(callee)) {
    callee = callee.expression;
  }
  if (!ts.isIdentifier(callee)) {
    return undefined;
  }
  return externDeclarationOfSymbol(checker.getSymbolAtLocation(callee), checker);
}

/** Whether this identifier use is the callee of the call it belongs to — the only position an
 * extern name may appear in (docs/FFI.md §1). An extern has no VALUE: aliasing one, passing
 * one, or reading one is STA1217, decided by the identifier arm, not the call arm. Optional
 * chains and non-null assertions are not direct calls either: the lowering builds one direct C
 * call, not a conditional one. */
export function isDirectCalleePosition(node: ts.Identifier): boolean {
  let current: ts.Expression = node;
  let parent = node.parent;
  while (parent !== undefined && ts.isParenthesizedExpression(parent)) {
    current = parent;
    parent = parent.parent;
  }
  return (
    parent !== undefined &&
    ts.isCallExpression(parent) &&
    parent.expression === current &&
    parent.questionDotToken === undefined
  );
}

/** `CString` / `CStringOwned` by alias (docs/FFI.md §2): the documented wrapper spellings.
 * `invalid` is an alias that does not wrap a string — trusted nowhere, refused as STA1119.
 * Structural lookalikes without the alias are NOT wrappers: the spelling is the contract, and
 * an inline `string & {...}` meets the refusal its HType earns instead. */
function cstringKindOf(type: ts.Type): 'cstring' | 'cstring-owned' | 'invalid' | undefined {
  const alias = type.aliasSymbol?.getName();
  if (alias !== 'CString' && alias !== 'CStringOwned') {
    return undefined;
  }
  const kind = alias === 'CString' ? ('cstring' as const) : ('cstring-owned' as const);
  if ((type.flags & ts.TypeFlags.StringLike) !== 0) {
    return kind;
  }
  // The helper spelling is an intersection (`string & { readonly __statorCstr: ... }`), whose
  // flags are `Intersection` rather than `String` — the constituents carry the string half.
  if (type.isIntersection() && type.types.some((t) => (t.flags & ts.TypeFlags.StringLike) !== 0)) {
    return kind;
  }
  return 'invalid';
}

/** A branded pointer (`{ readonly __brand: "sqlite3" }`, docs/FFI.md §2): opaque, library-owned,
 * and without a runtime representation in steps 4–5 — STA1217 until step 6's per-signature
 * ownership lands. Only object types qualify, and only the documented single-literal shape: a
 * wider object is STA1115, whatever it names its fields. */
function isBrandedPointer(type: ts.Type, checker: ts.TypeChecker): boolean {
  if ((type.flags & ts.TypeFlags.Object) === 0) {
    return false;
  }
  const properties = checker.getPropertiesOfType(type);
  if (properties.length !== 1 || properties[0]?.name !== '__brand') {
    return false;
  }
  const prop = properties[0];
  const at = prop.valueDeclaration ?? prop.declarations?.[0];
  if (at === undefined) {
    return false;
  }
  const propType = checker.getTypeOfSymbolAtLocation(prop, at);
  return (propType.flags & ts.TypeFlags.StringLiteral) !== 0;
}

function refused(code: string, message: string): ExternClassified {
  return { ok: false, code, message };
}

/** One signature position through the ABI table: the C kind, or the refusal that owns it.
 * `void` is a return position only; `CStringOwned` a parameter position only. */
function classifyPosition(
  type: ts.Type,
  checker: ts.TypeChecker,
  position: 'param' | 'return',
): ExternAbiKind | ExternClassified {
  const cstring = cstringKindOf(type);
  if (cstring === 'cstring') {
    return 'cstring';
  }
  if (cstring === 'cstring-owned') {
    return position === 'param'
      ? 'cstring-owned'
      : refused(
          'STA1119',
          'CStringOwned as a return is outside the ABI table (docs/FFI.md) — ' +
            'a returned pointer the runtime must free has no known allocator',
        );
  }
  if (cstring === 'invalid') {
    return refused('STA1119', "CString in an extern signature must brand 'string' (docs/FFI.md)");
  }
  if (isBrandedPointer(type, checker)) {
    // A TABLE type (docs/FFI.md §2 `T*`) whose lowering is not in steps 4–5: the pointer needs
    // a representation and an ownership rule, which is step 6's per-signature treatment. Never
    // a never-code — the table promises it — so STA1217 names what is missing.
    return {
      ok: false,
      code: 'STA1217',
      message:
        'a branded pointer in an extern signature is not yet supported; ' +
        'planned for Phase 7 (per-signature ownership)',
      phase: 7,
    };
  }
  const mapped = tsTypeToHType(type, checker);
  switch (mapped.kind) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'undefined':
      return position === 'return'
        ? 'void'
        : refused(
            'STA1119',
            'void as a parameter is outside the ABI table (docs/FFI.md) — return position only',
          );
    case 'string':
      return refused(
        'STA1118',
        'string in an extern signature has no direct C mapping; ' +
          'use CString (borrow) or CStringOwned (transfer) (docs/FFI.md)',
      );
    case 'unknown':
      return refused(
        'STA1114',
        'unknown in an extern signature has no C representation; ' +
          'use a type from the ABI table (docs/FFI.md)',
      );
    case 'object':
      return refused(
        'STA1115',
        'object type in an extern signature has no C representation; ' +
          'use a branded pointer or CString (docs/FFI.md)',
      );
    case 'array':
      return refused(
        'STA1116',
        'array type in an extern signature has no C representation; ' +
          'pass a pointer and a length as ABI types (docs/FFI.md)',
      );
    case 'fn':
      return refused(
        'STA1117',
        'function type in an extern signature has no C representation; ' +
          'v0 has no closure trampoline (docs/FFI.md)',
      );
    default:
      return refused(
        'STA1119',
        `${hTypeName(mapped)} in an extern signature is outside the ABI table (docs/FFI.md)`,
      );
  }
}

const C_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The whole declaration through the table: parameter kinds, return kind, and the opted-in
 * error convention against the return it reads. Deterministic order — parameters left to
 * right, then the return, then the convention — so one signature earns one diagnostic. */
export function classifyExternDeclaration(
  decl: ts.FunctionDeclaration,
  checker: ts.TypeChecker,
): ExternClassified {
  const marker = markerOf(decl);
  const tsName = decl.name?.text ?? 'anonymous';
  const cName = marker?.cName ?? tsName;
  if (!C_IDENTIFIER.test(cName)) {
    return refused(
      'STA1119',
      `'${cName}' is not a C identifier, so it names no C symbol (docs/FFI.md)`,
    );
  }
  // `printf`-style varargs have no sound signature: each call site is a different function
  // type (plan §10 out-of-scope table). Permanent, by design — no phase will infer one.
  if (decl.parameters.some((param) => param.dotDotDotToken !== undefined)) {
    return refused(
      'STA1120',
      'variadic extern declaration is not supported — each call site is a different ' +
        'function type (docs/FFI.md)',
    );
  }
  const params: ExternAbiKind[] = [];
  for (const param of decl.parameters) {
    // The DECLARED type, not the use-site one: this is the contract the call must meet, and
    // narrowing at a call site must not renegotiate it.
    const paramType = checker.getTypeAtLocation(param);
    const kind = classifyPosition(paramType, checker, 'param');
    if (typeof kind !== 'string') {
      return kind;
    }
    params.push(kind);
  }
  const signature = checker.getSignatureFromDeclaration(decl);
  if (signature === undefined) {
    return refused(
      'STA1119',
      `'${tsName}' has no call signature, so there is no ABI tuple to map (docs/FFI.md)`,
    );
  }
  const ret = classifyPosition(signature.getReturnType(), checker, 'return');
  if (typeof ret !== 'string') {
    return ret;
  }
  const errors = marker?.errors ?? [];
  if (errors.length > 1) {
    return refused(
      'STA1119',
      'one @statorError convention per declaration; a combination is outside the ABI table ' +
        '(docs/FFI.md)',
    );
  }
  const [convention] = errors;
  let error: ExternErrorConvention | undefined;
  if (convention !== undefined) {
    if (!isExternErrorConvention(convention)) {
      return refused(
        'STA1119',
        `unknown error convention '${convention}'; the closed set is nonzero, negative, null, ` +
          'errno (docs/FFI.md)',
      );
    }
    const mismatch = externConventionMismatch(ret, convention);
    if (mismatch !== undefined) {
      return refused('STA1119', `${mismatch} (docs/FFI.md)`);
    }
    error = convention;
  }
  return { ok: true, signature: { tsName, cName, params, ret, error } };
}
