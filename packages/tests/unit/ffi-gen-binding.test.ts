/* ffi-gen (plan.md §10 Task 7.3 steps 3–5): the binding generator — C header → `.d.ts`.
 *
 * Three layers, tested separately: the pure reverse-ABI matrix over hand-built models (no
 * clang), the end-to-end run over small inline headers (clang-gated, skipped without one),
 * and the oracle diff over inline snippets. The end-to-end proof closes the loop through the
 * REAL gate classifier (`extern.ts`): every emitted declaration must classify `ok`.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import * as ts from 'typescript';
import { classifyFunction, mapCType, tsFunctionName } from '../../compiler/src/ffi-gen/abi.ts';
import { runClangAstDump } from '../../compiler/src/ffi-gen/ast.ts';
import {
  diffBindings,
  readHandwritten,
  renderDiffReport,
} from '../../compiler/src/ffi-gen/diff.ts';
import {
  diagnosticLine,
  generate,
  renderDts,
  summaryLine,
} from '../../compiler/src/ffi-gen/emit.ts';
import type { CFunction, HeaderModel } from '../../compiler/src/ffi-gen/model.ts';
import { buildModel } from '../../compiler/src/ffi-gen/model.ts';
import { classifyExternDeclaration } from '../../compiler/src/frontend/extern.ts';
import { createProgram } from './helpers.ts';

const CLANG = process.env['CC'] ?? 'clang';

function hasClang(): boolean {
  try {
    return spawnSync(CLANG, ['--version'], { encoding: 'utf8' }).status === 0;
  } catch {
    return false;
  }
}

/** `{ skip }` for every test that shells to clang — a skipped proof stays visible in the runner. */
const NEEDS_CLANG = hasClang() ? {} : { skip: 'no C compiler on PATH' };

const EMPTY_MODEL: HeaderModel = {
  basename: 'test.h',
  functions: [],
  typedefs: new Map(),
  recordsById: new Map(),
  enums: [],
  macros: [],
  globals: [],
};

function modelWith(overrides: {
  readonly typedefs?: HeaderModel['typedefs'];
  readonly recordsById?: HeaderModel['recordsById'];
}): HeaderModel {
  return {
    ...EMPTY_MODEL,
    typedefs: overrides.typedefs ?? EMPTY_MODEL.typedefs,
    recordsById: overrides.recordsById ?? EMPTY_MODEL.recordsById,
  };
}

function cfn(
  cName: string,
  params: readonly string[],
  returnType: string,
  extra?: {
    readonly variadic?: boolean;
    readonly isInline?: boolean;
    readonly isStatic?: boolean;
    readonly hasBody?: boolean;
  },
): CFunction {
  return {
    cName,
    line: 1,
    params: params.map((cType, index) => ({ name: `a${index}`, cType })),
    returnType,
    variadic: extra?.variadic ?? false,
    isInline: extra?.isInline ?? false,
    isStatic: extra?.isStatic ?? false,
    hasBody: extra?.hasBody ?? false,
  };
}

function mappedType(
  cType: string,
  position: 'param' | 'return',
  model: HeaderModel = EMPTY_MODEL,
): string {
  const mapped = mapCType(cType, model, position);
  assert.equal(mapped.ok, true, `expected mapping: ${JSON.stringify(mapped)}`);
  if (!mapped.ok) {
    throw new Error('unreachable');
  }
  const value = mapped.value;
  if (value.kind === 'primitive') {
    return value.ts;
  }
  if (value.kind === 'out-param') {
    return `out:${value.alias}`;
  }
  return `pointer:${value.alias}`;
}

function refusedCode(
  cType: string,
  position: 'param' | 'return',
  model: HeaderModel = EMPTY_MODEL,
): string {
  const mapped = mapCType(cType, model, position);
  assert.equal(mapped.ok, false, `expected refusal: ${JSON.stringify(mapped)}`);
  if (mapped.ok) {
    throw new Error('unreachable');
  }
  return `${mapped.refusal.reason}||${mapped.refusal.code ?? 'nocode'}`;
}

void test('C names camelCase mechanically, never guessing a library prefix', () => {
  assert.equal(tsFunctionName('sqlite3_step'), 'sqlite3Step');
  assert.equal(tsFunctionName('sqlite3_libversion_number'), 'sqlite3LibversionNumber');
  assert.equal(tsFunctionName('plain_add'), 'plainAdd');
  assert.equal(tsFunctionName('delete'), 'deleteFn');
});

void test('scalars map through the reverse table; void is return-only', () => {
  assert.equal(mappedType('double', 'param'), 'number');
  assert.equal(mappedType('float', 'return'), 'number');
  assert.equal(mappedType('int', 'param'), 'number');
  assert.equal(mappedType('unsigned int', 'return'), 'number');
  assert.equal(mappedType('short', 'param'), 'number');
  assert.equal(mappedType('unsigned char', 'return'), 'number');
  assert.equal(mappedType('bool', 'param'), 'boolean');
  assert.equal(mappedType('_Bool', 'return'), 'boolean');
  assert.equal(mappedType('void', 'return'), 'void');
  assert.match(refusedCode('void', 'param'), /return position only/);
});

void test('strings follow the const rule: borrow in, copy out, never mutable', () => {
  assert.equal(mappedType('const char *', 'param'), 'cstring');
  assert.equal(mappedType('const unsigned char *', 'return'), 'cstring');
  assert.equal(mappedType('char *', 'return'), 'cstring');
  assert.match(refusedCode('char *', 'param'), /mutable/);
  assert.match(refusedCode('char * const', 'param'), /mutable/);
});

void test('struct pointers brand; unions, bitfields, and T** refuse', () => {
  const model = modelWith({
    typedefs: new Map([
      ['Node', { name: 'Node', underlying: 'struct Node', anonTagId: undefined }],
    ]),
    recordsById: new Map([
      ['r1', { id: 'r1', name: 'Node', tag: 'struct', complete: true, hasBitfield: false }],
      ['r2', { id: 'r2', name: 'Bits', tag: 'struct', complete: true, hasBitfield: true }],
    ]),
  });
  assert.equal(mappedType('Node *', 'param', model), 'pointer:Ptr_Node');
  assert.equal(mappedType('struct Node *', 'param', model), 'pointer:Ptr_Node');
  // A `T*` pointing at a brand in PARAMETER position is the v0.1 out-param spelling.
  assert.equal(mappedType('Node **', 'param', model), 'out:Ptr_Node');
  assert.equal(mappedType('struct Node **', 'param', model), 'out:Ptr_Node');
  // Return position stays refused: Out<T> is parameter-only.
  assert.match(refusedCode('Node **', 'return', model), /return position.*\|\|STA1119/);
  // A `const char **` out-param copies on read (`Out<CString>`, docs/FFI.md section 2);
  // anything else unbranded stays refused, with the reason named.
  assert.equal(mappedType('const char **', 'param', model), 'out:CString');
  assert.match(refusedCode('int **', 'param', model), /not a branded pointer.*\|\|STA1119/);
  assert.match(refusedCode('char **', 'param', model), /mutable.*\|\|STA1119/);
  // Triple (or deeper) pointers never map, in either position.
  assert.match(refusedCode('Node ***', 'param', model), /T\*\*\*.*\|\|STA1119/);
  assert.match(refusedCode('Node ***', 'return', model), /T\*\*.*\|\|STA1119/);
  assert.match(refusedCode('struct Bits *', 'param', model), /bitfield/);
  assert.match(refusedCode('union U *', 'param', model), /union/);
  assert.match(refusedCode('union U', 'param', model), /union/);
  assert.match(refusedCode('struct Node', 'param', model), /by value/);
});

void test('an anonymous struct behind a typedef is still a branded pointer', () => {
  const model = modelWith({
    typedefs: new Map([
      ['Point', { name: 'Point', underlying: 'struct Point', anonTagId: 'anon1' }],
    ]),
    recordsById: new Map([
      [
        'anon1',
        { id: 'anon1', name: undefined, tag: 'struct', complete: true, hasBitfield: false },
      ],
    ]),
  });
  assert.equal(mappedType('Point *', 'param', model), 'pointer:Ptr_Point');
});

void test('typedef chains that hide declarator depth re-enter the full analysis', () => {
  const model = modelWith({
    typedefs: new Map([
      [
        'sqlite3_filename',
        { name: 'sqlite3_filename', underlying: 'const char *', anonTagId: undefined },
      ],
      ['NodePtr', { name: 'NodePtr', underlying: 'struct Node *', anonTagId: undefined }],
      ['cb_t', { name: 'cb_t', underlying: 'void (*)(int)', anonTagId: undefined }],
    ]),
    recordsById: new Map([
      ['r1', { id: 'r1', name: 'Node', tag: 'struct', complete: true, hasBitfield: false }],
    ]),
  });
  // A starless use-site spelling is no proof of a scalar: the star hides in the typedef.
  assert.equal(mappedType('sqlite3_filename', 'param', model), 'cstring');
  // One outer star plus one hidden star is T** with a brand pointee: Out, not a brand.
  assert.equal(mappedType('NodePtr *', 'param', model), 'out:Ptr_Node');
  assert.equal(mappedType('NodePtr', 'param', model), 'pointer:Ptr_Node');
  // A function pointer behind a typedef is still STA1117, not "unsupported".
  assert.match(refusedCode('cb_t', 'param', model), /\|\|STA1117/);
});

void test('64-bit integers refuse; size_t widens by documented rule', () => {
  const model = modelWith({
    typedefs: new Map([
      ['my_ulong', { name: 'my_ulong', underlying: 'unsigned long', anonTagId: undefined }],
      ['i64_t', { name: 'i64_t', underlying: 'long long', anonTagId: undefined }],
      ['sqlite3_int64', { name: 'sqlite3_int64', underlying: 'long long', anonTagId: undefined }],
    ]),
  });
  for (const spelling of ['long', 'unsigned long', 'long long', 'int64_t', 'uint64_t']) {
    assert.match(refusedCode(spelling, 'return'), /64-bit/, spelling);
  }
  assert.match(refusedCode('my_ulong', 'return', model), /64-bit/);
  assert.match(refusedCode('i64_t', 'return', model), /64-bit/);
  assert.match(refusedCode('sqlite3_int64', 'return', model), /64-bit/);
  assert.equal(mappedType('size_t', 'return'), 'number');
  assert.equal(mappedType('size_t', 'param'), 'number');
});

void test('void*, scalar pointers, arrays, fn pointers, and unknowns refuse with their codes', () => {
  assert.equal(mappedType('void *', 'param'), 'pointer:Ptr_void');
  assert.match(refusedCode('void *', 'return'), /allocator/);
  assert.match(refusedCode('int *', 'param'), /out-param\/array/);
  assert.match(refusedCode('char [64]', 'param'), /\|\|STA1116/);
  assert.match(refusedCode('void (*)(int)', 'param'), /\|\|STA1117/);
  assert.match(refusedCode('mystery_t', 'param'), /unknown type.*\|\|STA1119/);
  assert.equal(mappedType('enum Color', 'return'), 'number');
});

void test('function-level scope refusals precede the positions, with the gate order inside', () => {
  const variadic = classifyFunction(
    cfn('f', ['const char *'], 'int', { variadic: true }),
    EMPTY_MODEL,
    new Set(),
  );
  assert.equal(variadic.ok, false);
  if (variadic.ok) {
    throw new Error('unreachable');
  }
  assert.equal(variadic.refusal.code, 'STA1120');
  for (const extra of [{ isInline: true }, { isStatic: true }, { hasBody: true }] as const) {
    const refused = classifyFunction(cfn('f', [], 'void', extra), EMPTY_MODEL, new Set());
    assert.equal(refused.ok, false);
  }
  // Parameters decide left to right before the return: the FIRST bad position names the diagnostic.
  const bad = classifyFunction(
    cfn('f', ['int', 'void (*)(int)'], 'mystery_t'),
    EMPTY_MODEL,
    new Set(),
  );
  assert.equal(bad.ok, false);
  if (bad.ok) {
    throw new Error('unreachable');
  }
  assert.match(bad.refusal.reason, /parameter 2/);
  assert.equal(bad.refusal.code, 'STA1117');
  // A taken TS name refuses the later C name — deterministic under the by-C-name ordering.
  const taken = new Set<string>(['plainAdd']);
  const collision = classifyFunction(cfn('plain_add', [], 'void'), EMPTY_MODEL, taken);
  assert.equal(collision.ok, false);
  if (collision.ok) {
    throw new Error('unreachable');
  }
  assert.match(collision.refusal.reason, /collides/);
});

const SAMPLE_HEADER = `#ifndef SAMPLE_FFIGEN_H
#define SAMPLE_FFIGEN_H
#define SAMPLE_OK 0
#define SAMPLE_VERSION "1.0"
#define SAMPLE_MAX(a, b) ((a) > (b) ? (a) : (b))
typedef struct { int x; int y; } Point;
typedef struct Node Node;
struct Node { int v; Node *next; };
union U { int i; double d; };
struct Bits { unsigned a : 3; unsigned b : 5; };
enum Color { RED, GREEN, BLUE };
typedef long long i64_t;
static inline int helper_add(int a, int b) { return a + b; }
int plain_add(int a, int b);
unsigned fetch_count(const char *name, Node *root);
char *make_copy(const char *s);
int open_node(const char *path, Node **out);
void take_fn(void (*cb)(int));
int vprintf_like(const char *fmt, ...);
i64_t get_bignum(void);
int take_union(union U u);
void take_bits(struct Bits *b);
int use_point(Point *p);
int color_of(enum Color c);
#endif
`;

function generateSample(headerName = 'sample.h'): {
  readonly dts: string;
  readonly summary: string;
  readonly diagnostics: string[];
} {
  const work = mkdtempSync(join(tmpdir(), 'stator-ffi-gen-'));
  try {
    const header = join(work, headerName);
    writeFileSync(header, SAMPLE_HEADER);
    const { root } = runClangAstDump(CLANG, header, []);
    const headerText = SAMPLE_HEADER;
    const result = generate(buildModel(root, header, headerText, process.cwd()));
    const dts = renderDts(result);
    // Determinism: the same model prints byte-identical output twice.
    assert.equal(renderDts(generate(buildModel(root, header, headerText, process.cwd()))), dts);
    return {
      dts,
      summary: summaryLine(result),
      diagnostics: result.refusals.map((refusal) => diagnosticLine(result.basename, refusal)),
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

void test(
  'end-to-end: six functions emitted with brands, twelve refusals with lines',
  NEEDS_CLANG,
  () => {
    const { dts, summary, diagnostics } = generateSample();
    assert.match(summary, /ffi-gen: 6 emitted, 12 refused \(.*\) from sample\.h/);
    assert.match(
      summary,
      /64-bit integer: 1, bitfield struct: 1, enum constant: 3, function pointer: 1, function-like macro: 1, inline function: 1, macro constant: 2, union: 1, variadic: 1/,
    );
    assert.ok(!summary.includes('T** out-param'), 'the sample keeps no T** refusal');
    assert.ok(dts.includes(`type Ptr_Node = { readonly __brand: 'Node' };`), 'struct brand');
    assert.ok(
      dts.includes(`type Ptr_Point = { readonly __brand: 'Point' };`),
      'anonymous-struct brand',
    );
    // The shared out-param alias is emitted once, before its uses.
    assert.equal(
      dts.split(`type Out<T> = { readonly value: T };`).length - 1,
      1,
      'exactly one Out alias',
    );
    assert.ok(
      dts.indexOf(`type Out<T> = { readonly value: T };`) < dts.indexOf('Out<Ptr_Node>'),
      'the Out alias precedes its uses',
    );
    // The #include pragma always names the input header's basename — mechanical, never a path.
    assert.ok(dts.includes(`// @statorLink #include "./sample.h"`), 'include pragma');
    assert.ok(!dts.includes(tmpdir()), 'no resolved path leaks into the pragma');
    assert.ok(dts.includes('/** @statorExtern plain_add */'), 'C symbol spelled explicitly');
    assert.ok(
      dts.includes('declare function plainAdd(a: number, b: number): number;'),
      'scalar declare line',
    );
    assert.ok(
      dts.includes('declare function fetchCount(name: CString, root: Ptr_Node): number;'),
      'borrow + brand declare line',
    );
    assert.ok(
      dts.includes('declare function makeCopy(s: CString): CString;'),
      'copy-out declare line',
    );
    assert.ok(
      dts.includes('declare function openNode(path: CString, out: Out<Ptr_Node>): number;'),
      'T** out-param declare line',
    );
    assert.ok(
      dts.includes('declare function usePoint(p: Ptr_Point): number;'),
      'anonymous-brand declare line',
    );
    assert.ok(dts.includes('declare function colorOf(c: number): number;'), 'enum declare line');
    assert.ok(!dts.includes('CStringOwned'), 'the generator never emits the transfer spelling');
    for (const construct of [
      'vprintf_like',
      'take_fn',
      'take_union',
      'take_bits',
      'get_bignum',
      'helper_add',
      'SAMPLE_OK',
      'SAMPLE_VERSION',
      'SAMPLE_MAX',
      'RED',
      'GREEN',
      'BLUE',
    ]) {
      assert.ok(
        diagnostics.some((line) => line.includes(construct) && /sample\.h:\d+/.test(line)),
        `refusal names construct + header line: ${construct}`,
      );
    }
    // The include guard is not a constant anyone binds.
    assert.ok(!diagnostics.some((line) => line.includes('SAMPLE_FFIGEN_H')), 'guard skipped');
    assert.ok(
      diagnostics.some((line) => line.includes('vprintf_like') && line.includes('STA1120')),
      'varargs keeps its permanent code',
    );
    assert.ok(
      diagnostics.some((line) => line.includes('take_fn') && line.includes('STA1117')),
      'function pointers keep their code',
    );
  },
);

void test(
  'end-to-end: every emitted non-Out declaration passes the real gate classifier',
  NEEDS_CLANG,
  () => {
    const { dts } = generateSample();
    const { program, sourceFile } = createProgram(dts, '/gen.d.ts');
    const checker = program.getTypeChecker();
    let count = 0;
    let skippedOut = 0;
    for (const stmt of sourceFile.statements) {
      if (!ts.isFunctionDeclaration(stmt)) {
        continue;
      }
      // The Out<T> out-param spelling compiles once the parallel compiler track lands
      // its gate/lowering support; the generator must not wait for it, so the check
      // below pins the five stable declarations and names the deferred one.
      const text = stmt.getText();
      if (text.includes('Out<')) {
        skippedOut += 1;
        continue;
      }
      count += 1;
      const classified = classifyExternDeclaration(stmt, checker);
      assert.equal(
        classified.ok,
        true,
        `generated declaration rejected: ${JSON.stringify(classified)}`,
      );
    }
    assert.equal(count, 5, 'all five non-Out emitted functions checked');
    assert.equal(skippedOut, 1, 'exactly the openNode Out declaration awaits compiler support');
  },
);

void test('oracle diff: matches, mismatches, and both one-sided rows', NEEDS_CLANG, () => {
  const work = mkdtempSync(join(tmpdir(), 'stator-ffi-gen-'));
  try {
    const header = join(work, 'mini.h');
    writeFileSync(
      header,
      'int plain_add(int a, int b);\nint open_node(const char *p, int **out);\n',
    );
    const { root } = runClangAstDump(CLANG, header, []);
    const result = generate(
      buildModel(root, header, 'int plain_add(int a, int b);\n', process.cwd()),
    );
    const hand = readHandwritten(
      `/** @statorExtern plain_add */\ndeclare function renA(a0: number, a1: boolean): number;\n` +
        `/** @statorExtern */\ndeclare function ghost(): number;\n`,
      'hand.d.ts',
    );
    const entries = diffBindings(result, hand);
    const byName = new Map(entries.map((entry) => [entry.cName, entry]));
    assert.equal(byName.get('plain_add')?.status, 'mismatch');
    assert.match(byName.get('plain_add')?.detail ?? '', /ts-name/);
    assert.equal(byName.get('ghost')?.status, 'hand-only-emittable');
    assert.equal(byName.get('open_node'), undefined, 'refused functions are not diff rows');
    const report = renderDiffReport(entries, 'mini.h', 'hand.d.ts');
    assert.match(report, /1 mismatch/);
    assert.match(report, /hand-only-emittable/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

void test('refusal codes: macros, enum constants, and globals cite STA1130', () => {
  const model: HeaderModel = {
    basename: 't.h',
    functions: [],
    typedefs: new Map(),
    recordsById: new Map(),
    enums: [{ id: 'e1', name: 'Color', line: 5, constants: [{ name: 'RED', line: 6 }] }],
    macros: [
      { name: 'FOO', line: 2, functionLike: false },
      { name: 'MAX', line: 3, functionLike: true },
    ],
    globals: [{ name: 'g', line: 8, cType: 'int' }],
  };
  const result = generate(model);
  assert.equal(result.refusals.length, 4);
  const byConstruct = new Map(result.refusals.map((refusal) => [refusal.construct, refusal]));
  for (const name of ['FOO', 'MAX', 'RED', 'g']) {
    assert.equal(byConstruct.get(name)?.code, 'STA1130', `${name} cites STA1130`);
  }
  assert.equal(byConstruct.get('FOO')?.kind, 'macro constant');
  assert.equal(byConstruct.get('MAX')?.kind, 'function-like macro');
  assert.equal(byConstruct.get('RED')?.kind, 'enum constant');
  assert.equal(byConstruct.get('g')?.kind, 'global variable');
  const lines = result.refusals.map((refusal) => diagnosticLine(result.basename, refusal));
  for (const [name, where] of [
    ['FOO', 't.h:2'],
    ['MAX', 't.h:3'],
    ['RED', 't.h:6'],
    ['g', 't.h:8'],
  ] as const) {
    const found = lines.find((line) => line.includes(`${name}: refused`));
    assert.ok(found !== undefined && found.includes('STA1130'), `${name} cites STA1130`);
    assert.ok(found !== undefined && found.includes(where), `${name} names header:line`);
  }
  assert.ok(
    !lines.some((line) => line.includes('no STA code allocated yet')),
    'the unallocated marker is gone',
  );
  assert.match(summaryLine(result), /enum constant: 1/);
  assert.match(summaryLine(result), /function-like macro: 1/);
  assert.match(summaryLine(result), /global variable: 1/);
  assert.match(summaryLine(result), /macro constant: 1/);
});

void test('refusal codes: gate-equivalent refusals keep their would-be codes', () => {
  const model: HeaderModel = {
    basename: 'g.h',
    functions: [
      cfn('v', ['int'], 'void', { variadic: true }),
      cfn('t', ['void (*)(int)'], 'void'),
      cfn('u', ['int **'], 'void'),
      cfn('w', [], 'long long'),
      cfn('x', [], 'void *'),
    ],
    typedefs: new Map(),
    recordsById: new Map(),
    enums: [],
    macros: [],
    globals: [],
  };
  const result = generate(model);
  assert.equal(result.refusals.length, 5);
  const byConstruct = new Map(result.refusals.map((refusal) => [refusal.construct, refusal]));
  assert.equal(byConstruct.get('v')?.code, 'STA1120');
  assert.equal(byConstruct.get('t')?.code, 'STA1117');
  assert.equal(byConstruct.get('u')?.code, 'STA1119');
  assert.equal(byConstruct.get('w')?.code, 'STA1119');
  assert.equal(byConstruct.get('x')?.code, 'STA1119');
  for (const refusal of result.refusals) {
    assert.ok(
      diagnosticLine(result.basename, refusal).includes(refusal.code ?? 'missing'),
      `${refusal.construct} cites its code`,
    );
    assert.notEqual(refusal.code, 'STA1130', `${refusal.construct} is not STA1130`);
  }
});

void test('--lib emits one @statorLink line per lib, in order, after the header comment', () => {
  const result = generate(EMPTY_MODEL);
  const plain = renderDts(result);
  assert.ok(!plain.includes('@statorLink: -l'), 'no flag means no link lines');
  assert.ok(
    plain.includes('// @statorLink #include "./test.h"'),
    'the include pragma is always emitted',
  );
  const withLibs = renderDts(result, ['sqlite3', 'm']);
  const lines = withLibs.split('\n');
  const generated = lines.findIndex((line) => line.startsWith('// GENERATED by ffi-gen'));
  const first = lines.indexOf('// @statorLink: -lsqlite3');
  const second = lines.indexOf('// @statorLink: -lm');
  const include = lines.indexOf('// @statorLink #include "./test.h"');
  assert.ok(generated !== -1 && first !== -1 && second !== -1 && include !== -1);
  assert.ok(
    generated < first && first < second && second < include,
    'header comment, then libs in order, then the include',
  );
});

void test('T** out-params share one Out alias that precedes its uses', () => {
  const model: HeaderModel = {
    basename: 'o.h',
    functions: [
      cfn('open_a', ['const char *', 'Node **'], 'int'),
      cfn('open_b', ['Node **', 'int'], 'void'),
      cfn('plain_add', ['int', 'int'], 'int'),
    ],
    typedefs: new Map([
      ['Node', { name: 'Node', underlying: 'struct Node', anonTagId: undefined }],
    ]),
    recordsById: new Map([
      ['r1', { id: 'r1', name: 'Node', tag: 'struct', complete: true, hasBitfield: false }],
    ]),
    enums: [],
    macros: [],
    globals: [],
  };
  const result = generate(model);
  assert.equal(result.functions.length, 3);
  assert.equal(result.usesOutAlias, true);
  const dts = renderDts(result);
  assert.equal(
    dts.split('type Out<T> = { readonly value: T };').length - 1,
    1,
    'exactly one Out alias for two Out params',
  );
  assert.ok(
    dts.indexOf('type Out<T> = { readonly value: T };') < dts.indexOf('Out<Ptr_Node>'),
    'the Out alias precedes its uses',
  );
  assert.ok(
    dts.includes('declare function openA(a0: CString, a1: Out<Ptr_Node>): number;'),
    'Out declare line',
  );
  assert.ok(
    dts.includes('out-param written on success'),
    'the ownership comment names the out-param',
  );
  const withoutOut = renderDts(generate(EMPTY_MODEL));
  assert.ok(!withoutOut.includes('type Out<T>'), 'no Out params means no alias');
});

void test(
  'cli: --lib is repeatable, output is deterministic, a second header errors',
  NEEDS_CLANG,
  () => {
    const work = mkdtempSync(join(tmpdir(), 'stator-ffi-gen-cli-'));
    try {
      const header = join(work, 'mini.h');
      writeFileSync(header, 'int plain_add(int a, int b);\n');
      const main = join('packages', 'compiler', 'src', 'ffi-gen', 'main.ts');
      const out = join(work, 'mini.d.ts');
      const run = spawnSync(
        process.execPath,
        [main, header, `--out=${out}`, '--lib=a', '--lib=b'],
        { encoding: 'utf8' },
      );
      assert.equal(run.status, 0, `ffi-gen failed:\n${run.stdout}${run.stderr}`);
      const text = readFileSync(out, 'utf8');
      const lines = text.split('\n');
      assert.ok(
        lines.indexOf('// @statorLink: -la') < lines.indexOf('// @statorLink: -lb'),
        'repeatable libs keep command-line order',
      );
      assert.ok(lines.includes('// @statorLink #include "./mini.h"'), 'basename include');
      // Determinism: a second run is byte-identical.
      const again = join(work, 'mini-again.d.ts');
      const rerun = spawnSync(
        process.execPath,
        [main, header, `--out=${again}`, '--lib=a', '--lib=b'],
        {
          encoding: 'utf8',
        },
      );
      assert.equal(rerun.status, 0, `ffi-gen rerun failed:\n${rerun.stdout}${rerun.stderr}`);
      assert.equal(readFileSync(again, 'utf8'), text, 'double run is byte-identical');
      // One binding wraps one header: a second positional is an error, not a second include.
      const extra = spawnSync(process.execPath, [main, header, join(work, 'other.h')], {
        encoding: 'utf8',
      });
      assert.equal(extra.status, 2, `expected exit 2:\n${extra.stdout}${extra.stderr}`);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  },
);
