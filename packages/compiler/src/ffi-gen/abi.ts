/** The ABI table in reverse (docs/FFI.md §2, plan.md §10 Task 7.3 step 4): C spellings to
 *  Stator declaration spellings. Mirrors `src/frontend/extern.ts`'s forward classification —
 *  one table, two directions — without importing its `ts.Type` internals: this tool parses
 *  clang JSON, not TypeScript.
 *
 *  Reverse rows: `double`/`float` → `number`, `bool` → `boolean`, `void` → void-return-only,
 *  `T*` → branded pointer, `const char*` → `CString` (`CStringOwned` stays param-only and is
 *  never generated — the generator cannot know a callee retains a string).
 *
 *  Deliberate spec fixes the manual bindings forced (examples/ffi/NOTES.md):
 *  - C `int` and its ≤32-bit kin widen to `number` (the `i32` refinement has no declaration
 *    spelling — "always widen to `number`").
 *  - `size_t`/`ssize_t` widen to `number` (refusing them would refuse `strlen`; the manual
 *    `string.d.ts` already widens — the widening is documented in the file legend, never silent).
 *  - 64-bit integers (`long`, `long long`, `int64_t`, …) are REFUSED: `number` cannot hold every
 *    int64 exactly, so mapping them would be a precision lie (NOTES.md "int64").
 *  - No error convention is ever inferred from a C return type (NOTES.md "comparisons are
 *    plain values"): every emitted function carries no `@statorError` tag.
 */

import type { CFunction, HeaderModel } from './model.ts';

export type TsPrimitive = 'number' | 'boolean' | 'void' | 'cstring';

export type AbiOk =
  | {
      readonly kind: 'primitive';
      readonly ts: TsPrimitive;
      readonly cNote: 'int' | 'size' | undefined;
    }
  | { readonly kind: 'pointer'; readonly alias: string; readonly tag: string };

export interface AbiRefusal {
  /** Short stable key — the summary line counts per kind, so these never vary. */
  readonly kind: string;
  /** The full diagnostic text (position and spelling included). */
  readonly reason: string;
  /** The gate code the hand-written equivalent would earn (`docs/DIAGNOSTICS.md`), or `undefined`
   *  where none is allocated yet (macro/enum constants — NOTES.md "macro constants"). */
  readonly code: string | undefined;
}

export type AbiResult =
  | { readonly ok: true; readonly value: AbiOk }
  | { readonly ok: false; readonly refusal: AbiRefusal };

function refuse(kind: string, reason: string, code: string | undefined): AbiResult {
  return { ok: false, refusal: { kind, reason, code } };
}

const INT32 = new Set([
  'char',
  'signed char',
  'unsigned char',
  'short',
  'short int',
  'signed short',
  'unsigned short',
  'int',
  'signed',
  'signed int',
  'unsigned',
  'unsigned int',
]);

const INT64 = new Set([
  'long',
  'long int',
  'signed long',
  'signed long int',
  'unsigned long',
  'unsigned long int',
  'long long',
  'long long int',
  'signed long long',
  'signed long long int',
  'unsigned long long',
  'unsigned long long int',
  '__int64',
  'int64_t',
  'uint64_t',
  'int_least64_t',
  'uint_least64_t',
  'int_fast64_t',
  'uint_fast64_t',
]);

const FLOATS = new Set(['float', 'double', 'long double']);
const BOOLS = new Set(['bool', '_Bool']);

export interface TypeContext {
  readonly model: HeaderModel;
}

/** Follow a typedef chain to its underlying spelling. `size_t`/`ssize_t` are answered by NAME
 *  (their width is platform ABI; the spelling is stable), everything else by structure. */
function resolveTypedef(name: string, model: HeaderModel): string | undefined {
  const seen = new Set<string>();
  let current = name;
  while (true) {
    if (seen.has(current)) {
      return undefined;
    }
    seen.add(current);
    const found = model.typedefs.get(current);
    if (found === undefined) {
      return current === name ? undefined : current;
    }
    current = found.underlying;
  }
}

function collapseSpaces(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function stripQualifiers(text: string): { readonly core: string; readonly hadConst: boolean } {
  const hadConst = /\bconst\b/.test(text);
  const core = collapseSpaces(
    text
      .replace(/\bconst\b/g, ' ')
      .replace(/\bvolatile\b/g, ' ')
      .replace(/\brestrict\b/g, ' ')
      .replace(/\b__restrict\b/g, ' '),
  );
  return { core, hadConst };
}

/** Split `base ***` into pointee spelling + depth. Callers exclude function pointers first
 *  (their parens carry stars that are not pointer depth). */
function splitPointer(spelling: string): { readonly base: string; readonly depth: number } {
  const depth = spelling.split('').filter((ch) => ch === '*').length;
  return { base: collapseSpaces(spelling.replace(/\*/g, ' ')), depth };
}

function brandAlias(tag: string): string {
  const clean = tag.replace(/[^A-Za-z0-9_]/g, '_');
  return `Ptr_${clean === '' ? 'anon' : clean}`;
}

/** Aggregate info for `struct Name`: union-ness (a refusal) and bitfield presence (a refusal).
 *  Anonymous structs resolve through the owning typedef's tag id (plan §10 Task 7.3 step 4). */
function recordFlags(
  model: HeaderModel,
  name: string,
): { readonly isUnion: boolean; readonly hasBitfield: boolean } | undefined {
  let isUnion = false;
  let hasBitfield = false;
  let found = false;
  for (const record of model.recordsById.values()) {
    if (record.name !== name || !record.complete) {
      continue;
    }
    found = true;
    if (record.tag === 'union') {
      isUnion = true;
    }
    if (record.hasBitfield) {
      hasBitfield = true;
    }
  }
  if (found) {
    return { isUnion, hasBitfield };
  }
  // An anonymous struct behind a typedef (`typedef struct {...} Point`): the elaborated
  // spelling reads `struct Point` with no named record — ask the typedef's owned tag.
  const alias = model.typedefs.get(name);
  const anon = alias?.anonTagId !== undefined ? model.recordsById.get(alias.anonTagId) : undefined;
  if (anon !== undefined && anon.complete) {
    return { isUnion: anon.tag === 'union', hasBitfield: anon.hasBitfield };
  }
  return undefined;
}

function mapStructPointee(model: HeaderModel, name: string, spellingForError: string): AbiResult {
  // A bare anonymous struct (`f(struct {...} *p)`) names no brand a `.d.ts` could share —
  // and each occurrence is a DISTINCT C type. Behind a typedef it resolves to a name instead.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return refuse(
      'anonymous struct',
      `anonymous struct '${spellingForError}' has no nameable brand — put it behind a typedef`,
      'STA1119',
    );
  }
  const flags = recordFlags(model, name);
  if (flags?.isUnion === true) {
    return refuse('union', `union '${spellingForError}' has no ABI row (docs/FFI.md)`, 'STA1119');
  }
  if (flags?.hasBitfield === true) {
    return refuse(
      'bitfield struct',
      `struct '${spellingForError}' contains bitfields, which v0 cannot lay out`,
      'STA1119',
    );
  }
  // Opaque or merely declared: a branded pointer either way — generated code never dereferences
  // it, so a definition is not needed (docs/FFI.md §2; the `stat` binding's whole shape).
  return { ok: true, value: { kind: 'pointer', alias: brandAlias(name), tag: name } };
}

/** The pointee of a single `*` (qualifiers kept for the `char` const rule). `via` counts
 *  typedef re-entries (below): a header that redefines a typedef does not compile, but the
 *  tool still never loops. */
function mapPointee(
  model: HeaderModel,
  base: string,
  position: 'param' | 'return',
  via: number,
): AbiResult {
  const { core, hadConst: isConst } = stripQualifiers(base);
  if (core === 'char' || core === 'unsigned char' || core === 'signed char') {
    if (isConst || position === 'return') {
      return { ok: true, value: { kind: 'primitive', ts: 'cstring', cNote: undefined } };
    }
    return refuse(
      'mutable char* buffer',
      `mutable '${core}*' buffer parameter has no ABI row — only borrowed CString in, copied CString out (docs/FFI.md §3)`,
      'STA1119',
    );
  }
  if (core === 'void') {
    if (position === 'param') {
      return { ok: true, value: { kind: 'pointer', alias: brandAlias('void'), tag: 'void' } };
    }
    return refuse(
      'void* return',
      '`void*` return has no ABI row — no allocator-return spelling exists in v0 (docs/FFI.md §3)',
      'STA1119',
    );
  }
  if (core.startsWith('struct ')) {
    return mapStructPointee(model, core.slice('struct '.length), core);
  }
  if (core.startsWith('union ')) {
    return refuse('union', `union '${core}' has no ABI row (docs/FFI.md)`, 'STA1119');
  }
  if (core.startsWith('enum ')) {
    const tag = core.slice('enum '.length);
    return { ok: true, value: { kind: 'pointer', alias: brandAlias(tag), tag } };
  }
  if (
    FLOATS.has(core) ||
    BOOLS.has(core) ||
    INT32.has(core) ||
    INT64.has(core) ||
    core === 'size_t' ||
    core === 'ssize_t'
  ) {
    return refuse(
      'scalar pointer',
      `scalar pointer '${core}*' is an out-param/array shape with no ABI row (docs/FFI.md)`,
      'STA1119',
    );
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(core)) {
    const resolved = resolveTypedef(core, model);
    if (resolved === undefined) {
      return refuse(
        'unknown type',
        `unknown type '${core}' — no typedef or tag declaration in scope`,
        'STA1119',
      );
    }
    if (resolved === core) {
      // A bare name that resolves to itself: an undeclared tag used sugar-free.
      // Struct tags spelled bare are invalid C; anything else is unknown.
      return refuse(
        'unknown type',
        `unknown type '${core}' — no typedef or tag declaration in scope`,
        'STA1119',
      );
    }
    if (via > 16) {
      return refuse(
        'unknown type',
        `unknown type '${core}' — typedef resolution did not terminate`,
        'STA1119',
      );
    }
    if (resolved.includes('*') || resolved.includes('(') || resolved.includes('[')) {
      // The chain hides declarator depth (`typedef Node *NodePtr` used as `NodePtr *` is TWO
      // stars): re-enter the full analysis with the consumed outer star re-attached, so the
      // total depth — not just this level's — decides between brand and T**.
      return mapCTypeInner(`${resolved} *`, model, position, via + 1);
    }
    return mapPointee(model, resolved, position, via + 1);
  }
  return refuse(
    'unsupported type',
    `type '${core}*' is outside the ABI table (docs/FFI.md)`,
    'STA1119',
  );
}

/** One scalar (non-pointer) spelling in the given position. */
function mapScalar(
  model: HeaderModel,
  core: string,
  position: 'param' | 'return',
  via: number,
): AbiResult {
  if (core === 'void') {
    return position === 'return'
      ? { ok: true, value: { kind: 'primitive', ts: 'void', cNote: undefined } }
      : refuse(
          'void parameter',
          '`void` as a parameter is outside the ABI table — return position only',
          'STA1119',
        );
  }
  if (FLOATS.has(core)) {
    return { ok: true, value: { kind: 'primitive', ts: 'number', cNote: undefined } };
  }
  if (BOOLS.has(core)) {
    return { ok: true, value: { kind: 'primitive', ts: 'boolean', cNote: undefined } };
  }
  if (INT32.has(core)) {
    return { ok: true, value: { kind: 'primitive', ts: 'number', cNote: 'int' } };
  }
  if (INT64.has(core) || core.endsWith('64_t')) {
    return refuse(
      '64-bit integer',
      `64-bit integer '${core}' has no ABI row — 'number' cannot hold every int64 exactly (NOTES.md "int64")`,
      'STA1119',
    );
  }
  if (core === 'size_t' || core === 'ssize_t') {
    return { ok: true, value: { kind: 'primitive', ts: 'number', cNote: 'size' } };
  }
  if (core === 'va_list' || core === '__builtin_va_list') {
    return refuse('va_list', '`va_list` parameter is varargs machinery with no ABI row', 'STA1119');
  }
  if (core.startsWith('struct ')) {
    return refuse(
      'struct by value',
      `struct '${core}' by value has no ABI row — by pointer only (docs/FFI.md §2)`,
      'STA1119',
    );
  }
  if (core.startsWith('union ')) {
    return refuse('union', `union '${core}' has no ABI row (docs/FFI.md)`, 'STA1119');
  }
  if (core.startsWith('enum ')) {
    return { ok: true, value: { kind: 'primitive', ts: 'number', cNote: 'int' } };
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(core)) {
    // Anonymous-enum typedefs (`typedef enum {...} Color`) resolve to `enum Color`;
    // named-enum typedefs resolve to `enum Tag`. Both are ints.
    const alias = model.typedefs.get(core);
    if (alias?.anonTagId !== undefined) {
      const anon = model.recordsById.get(alias.anonTagId);
      if (anon?.tag === 'union') {
        return refuse('union', `union '${core}' has no ABI row (docs/FFI.md)`, 'STA1119');
      }
    }
    const resolved = resolveTypedef(core, model);
    if (resolved === undefined || resolved === core) {
      // `FILE`-style: used but never declared in the dump's reach — unknown, not approximated.
      const recordNames = new Set<string>();
      for (const record of model.recordsById.values()) {
        if (record.name !== undefined) {
          recordNames.add(record.name);
        }
      }
      if (recordNames.has(core)) {
        return refuse(
          'struct by value',
          `struct '${core}' by value has no ABI row — by pointer only (docs/FFI.md §2)`,
          'STA1119',
        );
      }
      return refuse(
        'unknown type',
        `unknown type '${core}' — no typedef or tag declaration in scope`,
        'STA1119',
      );
    }
    if (via > 16) {
      return refuse(
        'unknown type',
        `unknown type '${core}' — typedef resolution did not terminate`,
        'STA1119',
      );
    }
    // The chain may hide declarator depth (`typedef const char *sqlite3_filename`): re-enter
    // the full analysis on the resolved spelling, which carries its own stars — a starless
    // use-site spelling is no proof of a scalar type.
    return mapCTypeInner(resolved, model, position, via + 1);
  }
  return refuse(
    'unsupported type',
    `type '${core}' is outside the ABI table (docs/FFI.md)`,
    'STA1119',
  );
}

/** One signature position through the table in reverse. Order mirrors the gate
 *  (`extern.ts`): structural refusals (function pointer, array) before the kind mapping. */
export function mapCType(
  cType: string,
  model: HeaderModel,
  position: 'param' | 'return',
): AbiResult {
  return mapCTypeInner(cType, model, position, 0);
}

function mapCTypeInner(
  cType: string,
  model: HeaderModel,
  position: 'param' | 'return',
  via: number,
): AbiResult {
  const spelling = collapseSpaces(cType);
  if (spelling.includes('(*)') || spelling.includes('(^')) {
    return refuse(
      'function pointer',
      'function pointer has no ABI row — v0 has no closure trampoline',
      'STA1117',
    );
  }
  if (spelling.includes('&')) {
    return refuse(
      'C++ reference',
      `C++ reference '${spelling}' is outside the C ABI table`,
      'STA1119',
    );
  }
  if (spelling.includes('[')) {
    return refuse(
      'array type',
      `array type '${spelling}' has no ABI row — pass a pointer and a length`,
      'STA1116',
    );
  }
  if (/\b(_Complex|__complex__|_Imaginary)\b/.test(spelling) || /\b__int128\b/.test(spelling)) {
    return refuse(
      'complex type',
      `type '${spelling}' is outside the ABI table (docs/FFI.md)`,
      'STA1119',
    );
  }
  // A trailing qualifier after the star (`char * const`) qualifies the pointer itself, not the
  // pointee — drop it before splitting, or a header spelling of a mutable buffer would read as
  // `char const` and pass the `const char` rule. A qualifier BEFORE the star stays: it is the
  // const-ness the CString rule branches on.
  const declarator = collapseSpaces(
    spelling.replace(/\*\s*((?:const|volatile|restrict|__restrict)\s*)+$/, '*'),
  );
  const { base, depth } = splitPointer(declarator);
  if (depth >= 2) {
    return refuse(
      'T** out-param',
      `'${spelling}' is a T** out-param with no ABI row — the v0.1 spelling question (docs/FFI.md §7.4)`,
      'STA1119',
    );
  }
  if (depth === 1) {
    // Const-ness that matters (`const char` vs `char`) lives INSIDE the base; pointer-level
    // `* const` is irrelevant to the mapping, so the whole base (qualifiers intact) goes in.
    return mapPointee(model, base, position, via);
  }
  return mapScalar(model, stripQualifiers(spelling).core, position, via);
}

export interface BrandRef {
  readonly alias: string;
  readonly tag: string;
}

export interface MappedParam {
  readonly tsName: string;
  readonly tsType: string;
  readonly ownership: 'value' | 'borrow' | 'pointer';
  readonly brand: BrandRef | undefined;
  /** Why this position widens: C `int`-family (`int`) or `size_t` (`size`) → `number`. */
  readonly cNote: 'int' | 'size' | undefined;
}

export interface MappedFunction {
  readonly cName: string;
  readonly tsName: string;
  readonly line: number;
  readonly cSignature: string;
  readonly params: readonly MappedParam[];
  readonly ret: string;
  readonly retBrand: BrandRef | undefined;
  readonly retNote: 'int' | 'size' | undefined;
  readonly retOwnership: 'value' | 'copy-out' | 'handle' | 'none';
  readonly needsCString: boolean;
}

export interface FunctionRefusal {
  readonly cName: string;
  readonly line: number;
  readonly kind: string;
  readonly reason: string;
  readonly code: string | undefined;
}

export type FunctionMapping =
  | { readonly ok: true; readonly fn: MappedFunction }
  | { readonly ok: false; readonly refusal: FunctionRefusal };

const TS_RESERVED = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'let',
  'static',
  'implements',
  'interface',
  'package',
  'private',
  'protected',
  'public',
  'type',
  'declare',
]);

const C_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** `sqlite3_libversion_number` → `sqlite3LibversionNumber`: mechanical camelCase, no prefix
 *  guessing (the manual `sqliteVersionNumber` spellings stay the oracle's to argue about). */
export function tsFunctionName(cName: string): string {
  const parts = cName.split('_').filter((part) => part !== '');
  if (parts.length === 0) {
    return 'fn';
  }
  const [head, ...tail] = parts as [string, ...string[]];
  const base = head + tail.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join('');
  const candidate = /^[A-Za-z_$]/.test(base) ? base : `_${base}`;
  return TS_RESERVED.has(candidate) ? `${candidate}Fn` : candidate;
}

function tsParamName(cName: string | undefined, index: number, taken: Set<string>): string {
  const raw =
    cName !== undefined && C_IDENTIFIER.test(cName) && !TS_RESERVED.has(cName)
      ? cName
      : `p${index}`;
  if (!taken.has(raw)) {
    return raw;
  }
  let suffix = 2;
  while (taken.has(`${raw}${suffix}`)) {
    suffix += 1;
  }
  return `${raw}${suffix}`;
}

function tsSpelling(value: AbiOk): string {
  if (value.kind === 'primitive') {
    return value.ts === 'cstring' ? 'CString' : value.ts;
  }
  return value.alias;
}

function brandOf(value: AbiOk): BrandRef | undefined {
  return value.kind === 'pointer' ? { alias: value.alias, tag: value.tag } : undefined;
}

function noteOf(value: AbiOk): 'int' | 'size' | undefined {
  return value.kind === 'primitive' ? value.cNote : undefined;
}

/** One function through the table: parameters left to right, then the return — the gate's
 *  order (`extern.ts`), so one signature earns one diagnostic. Function-level scope refusals
 *  (varargs, inline, static, defined-in-header) precede the positions. */
export function classifyFunction(
  fn: CFunction,
  model: HeaderModel,
  takenNames: Set<string>,
): FunctionMapping {
  const refused = (kind: string, reason: string, code: string | undefined): FunctionMapping => ({
    ok: false,
    refusal: { cName: fn.cName, line: fn.line, kind, reason, code },
  });
  if (fn.variadic) {
    return refused(
      'variadic',
      'variadic (`printf`-style) function has no sound signature',
      'STA1120',
    );
  }
  if (fn.isInline) {
    return refused(
      'inline function',
      'inline function lives in the header, not in the linked library',
      'STA1119',
    );
  }
  if (fn.hasBody) {
    return refused(
      'header-local definition',
      'function defined in the header (a body, not a declaration) is header-local',
      'STA1119',
    );
  }
  if (fn.isStatic) {
    return refused(
      'static function',
      '`static` function has internal linkage — no C symbol to bind',
      'STA1119',
    );
  }
  const tsName = tsFunctionName(fn.cName);
  if (takenNames.has(tsName)) {
    return refused(
      'name collision',
      `TS name '${tsName}' collides with another generated declaration`,
      'STA1119',
    );
  }
  takenNames.add(tsName);
  const params: MappedParam[] = [];
  const usedParamNames = new Set<string>();
  for (const [index, param] of fn.params.entries()) {
    const mapped = mapCType(param.cType, model, 'param');
    if (!mapped.ok) {
      const refusal = mapped.refusal;
      return refused(
        refusal.kind,
        `parameter ${index + 1} ('${collapseSpaces(param.cType)}'): ${refusal.reason}`,
        refusal.code,
      );
    }
    const tsNameParam = tsParamName(param.name, index, usedParamNames);
    usedParamNames.add(tsNameParam);
    const value = mapped.value;
    params.push({
      tsName: tsNameParam,
      tsType: tsSpelling(value),
      ownership:
        value.kind === 'primitive' ? (value.ts === 'cstring' ? 'borrow' : 'value') : 'pointer',
      brand: brandOf(value),
      cNote: noteOf(value),
    });
  }
  const ret = mapCType(fn.returnType, model, 'return');
  if (!ret.ok) {
    const refusal = ret.refusal;
    return refused(
      refusal.kind,
      `return ('${collapseSpaces(fn.returnType)}'): ${refusal.reason}`,
      refusal.code,
    );
  }
  const retValue = ret.value;
  const retSpelling = tsSpelling(retValue);
  return {
    ok: true,
    fn: {
      cName: fn.cName,
      tsName,
      line: fn.line,
      cSignature: `${collapseSpaces(fn.returnType)} (${fn.params.map((p) => collapseSpaces(p.cType)).join(', ')})`,
      params,
      ret: retSpelling,
      retBrand: brandOf(retValue),
      retNote: noteOf(retValue),
      retOwnership:
        retValue.kind === 'primitive'
          ? retValue.ts === 'cstring'
            ? 'copy-out'
            : retValue.ts === 'void'
              ? 'none'
              : 'value'
          : 'handle',
      needsCString: params.some((p) => p.tsType === 'CString') || retSpelling === 'CString',
    },
  };
}
