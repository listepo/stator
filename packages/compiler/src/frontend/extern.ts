/* Extern declarations — the Task 7.1 gate surface (docs/FFI.md §1–§3).
 *
 * An extern function is a `declare function` in a script (non-module) `.d.ts`, promoted by a
 * per-declaration JSDoc marker (`@statorExtern` plus the symbol/header/lib/abi/throws tags). This
 * module reads that marker — off `node.jsDoc[].tags` directly, because `ts.getJSDocTags()`
 * answers `[]` on the pinned `typescript` (plan-notes 241) — and validates the declaration against
 * the ABI table, producing either an `ExternDecl` the lowering (Task 7.1 step 5) consumes verbatim
 * or the single STA20xx diagnostic the call site reports.
 *
 * Two entry points, one per direction the gate meets an extern from. `externDeclOfCall` resolves a
 * call's callee through the checker and validates the marked declaration behind it; anything
 * unmarked answers `null` so the existing global/STA1214 logic owns it untouched.
 * `externDeclErrors` is the declaration site for files the gate walks (`.d.ts` files never reach
 * it — `gateProgram` skips them): a marked ambient there is STA2008, and nothing else, because
 * marker and signature details are moot once the file kind is wrong.
 *
 * The one representation this module relies on: a branded pointer
 * (`{ readonly __stator_brand: '<C type>' }`) maps to the `pointer` HType (`hPointer`), whose
 * brand IS the C spelling the emitted prototype names (FFI.md §4). Two brands stay incompatible
 * (nominal equality), which is the property §4 needs; the spelling travels beside it in
 * `brand`/`retBrand`, which is what the emitter reads.
 */

import * as ts from 'typescript';
import {
  H_BOOLEAN,
  H_NUMBER,
  H_STRING,
  H_UNDEFINED,
  hPointer,
  hTypeName,
  hUnknown,
} from '../hir/types.ts';
import type { HType } from '../hir/types.ts';
import { diagnosticFromNode } from '../support/diagnostics.ts';
import type { Diagnostic } from '../support/diagnostics.ts';
import { tsTypeToHType } from './types.ts';

export interface ExternParamC {
  readonly name: string;
  readonly c: 'double' | 'int32' | 'bool' | 'cstring' | 'pointer';
  readonly brand?: string;
  readonly type: HType;
}

export interface ExternDecl {
  readonly tsName: string;
  readonly cSymbol: string;
  readonly headers: readonly string[];
  readonly libs: readonly string[];
  readonly params: readonly ExternParamC[];
  readonly retC: 'double' | 'int32' | 'bool' | 'void' | 'cstring' | 'pointer';
  readonly retBrand?: string;
  readonly retType: HType;
  readonly throws: 'none' | 'nonzero' | 'negative' | 'null' | 'errno';
}

export function externDeclOfCall(
  node: ts.CallExpression,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  mode: 'ts' | 'js',
): { readonly decl: ExternDecl } | { readonly error: Diagnostic } | null {
  let callee: ts.Expression = node.expression;
  while (ts.isParenthesizedExpression(callee)) {
    callee = callee.expression;
  }
  // Only a bare name can be an extern: a member call is vetted by the existing arms, and letting
  // those arms keep it is what "fall through untouched" means.
  if (!ts.isIdentifier(callee)) {
    return null;
  }
  const symbol = checker.getSymbolAtLocation(callee);
  const declarations = symbol?.declarations ?? [];
  let target: ts.FunctionDeclaration | undefined;
  for (const declaration of declarations) {
    if (
      ts.isFunctionDeclaration(declaration) &&
      declaration.body === undefined &&
      declaration.getSourceFile().isDeclarationFile &&
      hasExternMarker(declaration)
    ) {
      target = declaration;
      break;
    }
  }
  // No marker anywhere behind the name: the existing global/STA1214 logic owns the call.
  if (target === undefined) {
    return null;
  }
  const validated = validateExtern(target, checker);
  if ('decl' in validated) {
    return { decl: validated.decl };
  }
  return {
    error: diagnosticFromNode(node, sourceFile, validated.code, 'error', mode, validated.message),
  };
}

export function externDeclErrors(
  fn: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
  mode: 'ts' | 'js',
): Diagnostic[] {
  // `.d.ts` files never reach the gate walk, so a marked ambient met here lives in a `.ts` or
  // `.js` file, where FFI.md §1 refuses externs. One diagnostic, never the full validation: the
  // marker and signature details are moot once the file kind is wrong.
  if (fn.body !== undefined || !hasExternMarker(fn)) {
    return [];
  }
  const name = fn.name?.text ?? '(anonymous)';
  return [
    diagnosticFromNode(
      fn,
      sourceFile,
      'STA2008',
      'error',
      mode,
      `extern '${name}' is only legal in a script (non-module) .d.ts file included with ` +
        `/// <reference path>; ambient declaration in ${sourceFile.fileName} is not an extern`,
    ),
  ];
}

/** Whether `fn` carries the promoting `@statorExtern` tag. The single reader of `.jsDoc`, shared
 * by this module and the gate's callee exemption so the two cannot drift on what "marked" means. */
export function hasExternMarker(fn: ts.FunctionDeclaration): boolean {
  return statorTagsOf(fn).some((tag) => tag.name === 'statorExtern');
}

/** A validation failure, still location-free: the caller pins it to the call node, which is the
 * span the user must fix (the declaration lives in a `.d.ts` the gate never walks). */
interface ExternFault {
  readonly code: 'STA2008' | 'STA2009' | 'STA2010' | 'STA2011';
  readonly message: string;
}

type ExternValidation = { readonly decl: ExternDecl } | ExternFault;

/** One parsed `@stator*` tag: its job name and its trimmed value text (`''` when valueless). */
interface StatorTag {
  readonly name: string;
  readonly value: string;
}

const KNOWN_TAGS: ReadonlySet<string> = new Set([
  'statorExtern',
  'statorSymbol',
  'statorHeader',
  'statorLib',
  'statorAbi',
  'statorThrows',
]);

const THROW_CONVENTIONS: ReadonlySet<string> = new Set(['nonzero', 'negative', 'null', 'errno']);

const SYMBOL_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

type AbiCType = 'int32_t' | 'const char*';

/** The JSDoc blocks parsed onto a node. The public `.d.ts` does not declare `.jsDoc`, so the read
 * goes through a structural carrier checked with `Array.isArray` rather than trusted. */
function jsDocBlocksOf(node: ts.Node): readonly ts.JSDoc[] {
  const carrier = node as unknown as { readonly jsDoc?: unknown };
  const docs = carrier.jsDoc;
  if (!Array.isArray(docs)) {
    return [];
  }
  return docs.filter(
    (doc): doc is ts.JSDoc => typeof doc === 'object' && doc !== null && 'tags' in doc,
  );
}

/** A tag's value text. A plain comment arrives as a string; a structured one (links, code spans)
 * arrives as parts, of which only the prose (`JSDocText`) can be a marker value. */
function tagCommentText(tag: ts.JSDocTag): string {
  const comment = tag.comment;
  if (comment === undefined) {
    return '';
  }
  if (typeof comment === 'string') {
    return comment;
  }
  let text = '';
  for (const part of comment) {
    if ('text' in part && typeof part.text === 'string') {
      text += part.text;
    }
  }
  return text;
}

/** Every `@stator*` tag on `fn`, in source order. Non-stator tags (`@param`, prose) are not
 * this surface's business and are skipped, not refused. */
function statorTagsOf(fn: ts.FunctionDeclaration): readonly StatorTag[] {
  const tags: StatorTag[] = [];
  for (const doc of jsDocBlocksOf(fn)) {
    const docTags = doc.tags;
    if (docTags === undefined) {
      continue;
    }
    for (const tag of docTags) {
      const name = tag.tagName.text;
      if (!name.startsWith('stator')) {
        continue;
      }
      tags.push({ name, value: tagCommentText(tag).trim() });
    }
  }
  return tags;
}

/** Validate a marked declaration end to end, first fault wins (the gate reports ONE diagnostic).
 * Precedence is file, then marker, then shape, then types: generics are refused as STA2011 before
 * their `T` can misreport as STA2010, and types are last because they need both the marker's ABI
 * selections and a plain function to be meaningful. */
function validateExtern(fn: ts.FunctionDeclaration, checker: ts.TypeChecker): ExternValidation {
  const name = fn.name?.text;
  if (name === undefined) {
    // Unreachable: the parser names every function declaration but `export default`, and that
    // spelling is a module, which the file check below refuses first.
    return {
      code: 'STA2011',
      message: 'an extern declaration must be a named function; anonymous ones cannot be called',
    };
  }

  const declFile = fn.getSourceFile();
  if (!declFile.isDeclarationFile) {
    return {
      code: 'STA2008',
      message:
        `extern '${name}' is only legal in a script (non-module) .d.ts file included with ` +
        `/// <reference path>; declared in ${declFile.fileName}, which is not a .d.ts file`,
    };
  }
  if (ts.isExternalModule(declFile)) {
    return {
      code: 'STA2008',
      message:
        `extern '${name}' is only legal in a script (non-module) .d.ts file included with ` +
        `/// <reference path>; declared in module ${declFile.fileName}`,
    };
  }

  const marker = readMarker(fn, name);
  if ('code' in marker) {
    return marker;
  }
  const shape = checkShape(fn, name, checker);
  if (shape !== undefined) {
    return shape;
  }
  return mapSignature(fn, name, checker, marker);
}

/** The marker tags, parsed and shape-checked (STA2009). ABI targets are checked against the real
 * parameter list here; whether a selection FITS its type is a type-phase STA2009. */
function readMarker(fn: ts.FunctionDeclaration, name: string): ExternMarker | ExternFault {
  const byName = new Map<string, string[]>();
  for (const tag of statorTagsOf(fn)) {
    if (!KNOWN_TAGS.has(tag.name)) {
      return {
        code: 'STA2009',
        message:
          `malformed '@${tag.name}' marker on extern '${name}'; ` +
          'known tags are @statorExtern, @statorSymbol, @statorHeader, ' +
          '@statorLib, @statorAbi, @statorThrows',
      };
    }
    const seen = byName.get(tag.name);
    if (seen === undefined) {
      byName.set(tag.name, [tag.value]);
    } else {
      seen.push(tag.value);
    }
  }

  const fail = (tag: string, detail: string): ExternFault => ({
    code: 'STA2009',
    message: `malformed '@${tag}' marker on extern '${name}'; ${detail}`,
  });

  const externTags = byName.get('statorExtern') ?? [];
  if (externTags.length !== 1) {
    return fail('statorExtern', "'@statorExtern' must appear exactly once");
  }
  const [externValue] = externTags;
  if (externValue === undefined || externValue !== '') {
    return fail('statorExtern', "'@statorExtern' takes no value");
  }

  const symbolTags = byName.get('statorSymbol') ?? [];
  if (symbolTags.length > 1) {
    return fail('statorSymbol', "'@statorSymbol' must appear at most once");
  }
  const [symbolValue] = symbolTags;
  if (symbolValue !== undefined && !SYMBOL_PATTERN.test(symbolValue)) {
    return fail(
      'statorSymbol',
      `'@statorSymbol' must match [A-Za-z_][A-Za-z0-9_]*; got '${symbolValue}'`,
    );
  }

  const headers = byName.get('statorHeader') ?? [];
  if (headers.length === 0) {
    return fail('statorHeader', "at least one '@statorHeader' is required");
  }
  for (const header of headers) {
    if (header === '') {
      return fail('statorHeader', "'@statorHeader' needs a file name");
    }
  }

  const libs = byName.get('statorLib') ?? [];
  for (const lib of libs) {
    if (lib === '') {
      return fail('statorLib', "'@statorLib' needs a library name");
    }
  }

  const throwsTags = byName.get('statorThrows') ?? [];
  if (throwsTags.length > 1) {
    return fail('statorThrows', "'@statorThrows' must appear at most once");
  }
  const [throwsValue] = throwsTags;
  if (throwsValue !== undefined && !isThrowsConvention(throwsValue)) {
    return fail(
      'statorThrows',
      `'@statorThrows' must be one of nonzero, negative, null, errno; got '${throwsValue}'`,
    );
  }

  const abi = new Map<string, AbiCType>();
  for (const raw of byName.get('statorAbi') ?? []) {
    const parsed = parseAbi(raw);
    if (parsed === undefined) {
      return fail(
        'statorAbi',
        "'@statorAbi' must be '<param>: <ctype>' with <ctype> 'int32_t' or " +
          `'const char*'; got '${raw}'`,
      );
    }
    if (abi.has(parsed.target)) {
      return fail('statorAbi', `'@statorAbi' for '${parsed.target}' appears more than once`);
    }
    if (parsed.target !== 'return' && !isParamName(fn, parsed.target)) {
      return fail('statorAbi', `'@statorAbi' names no parameter '${parsed.target}'`);
    }
    abi.set(parsed.target, parsed.ctype);
  }

  return {
    cSymbol: symbolValue === undefined || symbolValue === '' ? name : symbolValue,
    headers,
    libs,
    abi,
    throws: throwsValue === undefined ? 'none' : throwsValue,
  };
}

/** The validated marker: everything `mapSignature` may trust without re-checking. */
interface ExternMarker {
  readonly cSymbol: string;
  readonly headers: readonly string[];
  readonly libs: readonly string[];
  readonly abi: ReadonlyMap<string, AbiCType>;
  readonly throws: ExternDecl['throws'];
}

function isThrowsConvention(value: string): value is ExternDecl['throws'] {
  return THROW_CONVENTIONS.has(value);
}

function parseAbi(raw: string): { readonly target: string; readonly ctype: AbiCType } | undefined {
  const colon = raw.indexOf(':');
  if (colon === -1) {
    return undefined;
  }
  const target = raw.slice(0, colon).trim();
  const ctype = raw.slice(colon + 1).trim();
  if (target === '' || (ctype !== 'int32_t' && ctype !== 'const char*')) {
    return undefined;
  }
  return { target, ctype };
}

/** Whether `fn` declares a plain-identifier parameter under `target` (`return` is not a name). */
function isParamName(fn: ts.FunctionDeclaration, target: string): boolean {
  return fn.parameters.some((param) => ts.isIdentifier(param.name) && param.name.text === target);
}

/** Whether the declaration is a plain function (STA2011): no type parameters, no overloads, no
 * optional/rest/defaulted/`this` parameters. Destructured bindings are left to the type phase —
 * a pattern implies an object type, which the ABI table refuses as STA2010 with the type named. */
function checkShape(
  fn: ts.FunctionDeclaration,
  name: string,
  checker: ts.TypeChecker,
): ExternFault | undefined {
  const plain =
    `extern '${name}' must be a plain function: no type parameters, no overloads, ` +
    "no optional or rest parameters, no 'this'";
  if (fn.typeParameters !== undefined && fn.typeParameters.length > 0) {
    return { code: 'STA2011', message: `${plain} (it declares type parameters)` };
  }
  // Every same-name body-less declaration behind the name is one overload signature; in a `.d.ts`
  // there is no body for them to share, so any second one refuses the set (FFI.md §3). Read off
  // the symbol rather than the sibling list so overloads split across files refuse the same way.
  const declarations = (fn.name === undefined ? undefined : checker.getSymbolAtLocation(fn.name))
    ?.declarations;
  const overloads = (declarations ?? []).filter(
    (declaration) =>
      ts.isFunctionDeclaration(declaration) &&
      declaration.body === undefined &&
      declaration.name?.text === name,
  );
  if (overloads.length > 1) {
    return {
      code: 'STA2011',
      message: `${plain} (found ${String(overloads.length)} same-name declarations)`,
    };
  }
  for (const param of fn.parameters) {
    if (ts.isIdentifier(param.name) && param.name.text === 'this') {
      return { code: 'STA2011', message: `${plain} (it declares a 'this' parameter)` };
    }
    if (param.dotDotDotToken !== undefined) {
      const label = ts.isIdentifier(param.name) ? param.name.text : 'at that position';
      return { code: 'STA2011', message: `${plain} (rest parameter '${label}')` };
    }
    if (param.questionToken !== undefined || param.initializer !== undefined) {
      const label = ts.isIdentifier(param.name) ? param.name.text : 'at that position';
      return { code: 'STA2011', message: `${plain} (parameter '${label}' is optional)` };
    }
  }
  return undefined;
}

/** A TS type mapped through the ABI table: the C spelling, the HType the boundary trusts, and
 * the brand when the spelling is a pointer. `label` locates the offender (`parameter 'x'`). */
interface CTypeMapping {
  readonly c: 'double' | 'int32' | 'bool' | 'void' | 'cstring' | 'pointer';
  readonly brand?: string;
  readonly type: HType;
}

function mapCType(
  name: string,
  htype: HType,
  tsType: ts.Type | undefined,
  checker: ts.TypeChecker,
  abi: AbiCType | undefined,
  isReturn: boolean,
  // The ABI target: the parameter name, or 'return'. Locates both this message and unmapped().
  target: string,
): CTypeMapping | ExternFault {
  const where = isReturn ? 'return type' : `parameter '${target}'`;
  const mismatch = (expectation: string): ExternFault => ({
    code: 'STA2009',
    message:
      `malformed '@statorAbi' marker on extern '${name}'; ` +
      `'@statorAbi '${target}: ${abi ?? ''}' does not apply to ${expectation}`,
  });
  const unmapped = (): ExternFault => ({
    code: 'STA2010',
    message:
      `extern '${name}' uses type '${hTypeName(htype)}', which has no C mapping; ` +
      `see docs/FFI.md §3 (${where})`,
  });
  switch (htype.kind) {
    case 'number':
      if (abi === undefined) {
        return { c: 'double', type: H_NUMBER };
      }
      return abi === 'int32_t'
        ? { c: 'int32', type: H_NUMBER }
        : mismatch("a number; only 'int32_t' selects off the default 'double'");
    case 'boolean':
      return abi === undefined
        ? { c: 'bool', type: H_BOOLEAN }
        : mismatch("a boolean; 'bool' has no alternate spelling");
    case 'string':
      if (abi === 'const char*') {
        return { c: 'cstring', type: H_STRING };
      }
      return abi === undefined ? unmapped() : mismatch("a string; only 'const char*' applies");
    case 'undefined':
      // `void` is `undefined` in the HType model (types.ts): same value, no separate kind.
      if (!isReturn) {
        return unmapped();
      }
      return abi === undefined
        ? { c: 'void', type: H_UNDEFINED }
        : mismatch('a void return, which takes no spelling');
    default: {
      // Anything the table does not name is refused — unless it is a branded handle, the one
      // object shape with a C spelling (FFI.md §4).
      const brand = tsType === undefined ? undefined : brandOf(tsType, checker);
      if (brand !== undefined) {
        return abi === undefined
          ? { c: 'pointer', brand, type: hPointer(brand) }
          : mismatch(`a branded pointer, which always spells '${brand}*'`);
      }
      return unmapped();
    }
  }
}

/** The C type name when `type` is a branded handle — an interface or type literal with exactly
 * one property, `__stator_brand`, of string-literal type — else `undefined`. The literal IS the
 * spelling: `'sqlite3'` calls through `sqlite3*` (FFI.md §4). */
function brandOf(type: ts.Type, checker: ts.TypeChecker): string | undefined {
  const symbol = type.getSymbol();
  const flags = symbol?.flags ?? 0;
  const brandable =
    symbol !== undefined &&
    (flags &
      (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeLiteral | ts.SymbolFlags.ObjectLiteral)) !==
      0;
  if (!brandable) {
    return undefined;
  }
  if (
    checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0 ||
    checker.getSignaturesOfType(type, ts.SignatureKind.Construct).length > 0
  ) {
    return undefined;
  }
  const properties = checker.getPropertiesOfType(type);
  if (properties.length !== 1) {
    return undefined;
  }
  const [property] = properties;
  if (
    property === undefined ||
    property.name !== '__stator_brand' ||
    (property.flags & ts.SymbolFlags.Optional) !== 0
  ) {
    return undefined;
  }
  const at = property.valueDeclaration ?? property.declarations?.[0];
  if (at === undefined) {
    return undefined;
  }
  const propertyType = checker.getTypeOfSymbolAtLocation(property, at);
  if ((propertyType.flags & ts.TypeFlags.StringLiteral) === 0) {
    return undefined;
  }
  const literal = propertyType as ts.StringLiteralType;
  return literal.value === '' ? undefined : literal.value;
}

/** Map every parameter and the return through the ABI table and assemble the declaration. */
function mapSignature(
  fn: ts.FunctionDeclaration,
  name: string,
  checker: ts.TypeChecker,
  marker: ExternMarker,
): ExternValidation {
  const params: ExternParamC[] = [];
  for (const param of fn.parameters) {
    const label = ts.isIdentifier(param.name) ? param.name.text : `#${String(params.length)}`;
    const tsType = checker.getTypeAtLocation(param);
    const mapped = mapCType(
      name,
      tsTypeToHType(tsType, checker),
      tsType,
      checker,
      marker.abi.get(label),
      false,
      label,
    );
    if ('code' in mapped) {
      return mapped;
    }
    if (mapped.c === 'void') {
      // Unreachable: mapCType faults a void parameter before returning a mapping. Kept so the
      // parameter's C spelling excludes 'void' by construction rather than by assertion.
      return {
        code: 'STA2010',
        message:
          `extern '${name}' uses type 'undefined', which has no C mapping; ` +
          `see docs/FFI.md §3 (parameter '${label}')`,
      };
    }
    if (!ts.isIdentifier(param.name)) {
      // Unreachable too: a pattern implies an object type, which the table refuses above.
      return {
        code: 'STA2011',
        message:
          `extern '${name}' must be a plain function: no type parameters, no overloads, ` +
          `no optional or rest parameters, no 'this' (parameter ${label} is not a plain name)`,
      };
    }
    params.push(
      mapped.brand === undefined
        ? { name: param.name.text, c: mapped.c, type: mapped.type }
        : { name: param.name.text, c: mapped.c, brand: mapped.brand, type: mapped.type },
    );
  }

  // A missing return annotation is an implicit `any`: Unknown, which the table refuses below.
  const retTsType = fn.type === undefined ? undefined : checker.getTypeAtLocation(fn.type);
  const retHType = retTsType === undefined ? hUnknown(false) : tsTypeToHType(retTsType, checker);
  const retMapped = mapCType(
    name,
    retHType,
    retTsType,
    checker,
    marker.abi.get('return'),
    true,
    'return',
  );
  if ('code' in retMapped) {
    return retMapped;
  }
  return {
    decl: {
      tsName: name,
      cSymbol: marker.cSymbol,
      headers: [...marker.headers],
      libs: [...marker.libs],
      params,
      retC: retMapped.c,
      ...(retMapped.brand !== undefined ? { retBrand: retMapped.brand } : {}),
      retType: retMapped.type,
      throws: marker.throws,
    },
  };
}
