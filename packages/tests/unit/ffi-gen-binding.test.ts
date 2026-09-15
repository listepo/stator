/* ffi-gen (plan.md §10 Task 7.3 steps 3–5): the binding generator — C header → `.d.ts`.
 *
 * Three layers, tested separately: the pure reverse-ABI matrix over hand-built models (no
 * clang), the end-to-end run over small inline headers (clang-gated, skipped without one),
 * and the oracle diff over inline snippets. The end-to-end proof closes the loop through the
 * REAL gate classifier (`extern.ts`): every emitted declaration must classify `ok`.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  return value.kind === 'primitive' ? value.ts : `pointer:${value.alias}`;
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
  assert.match(refusedCode('Node **', 'param', model), /T\*\*/);
  assert.match(refusedCode('const char **', 'param', model), /T\*\*/);
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
  // One outer star plus one hidden star is T**, not a brand.
  assert.match(refusedCode('NodePtr *', 'param', model), /T\*\*/);
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
  'end-to-end: five functions emitted with brands, thirteen refusals with lines',
  NEEDS_CLANG,
  () => {
    const { dts, summary, diagnostics } = generateSample();
    assert.match(summary, /ffi-gen: 5 emitted, 13 refused \(.*\) from sample\.h/);
    assert.match(
      summary,
      /64-bit integer: 1, T\*\* out-param: 1, bitfield struct: 1, enum constant: 3, function pointer: 1, function-like macro: 1, inline function: 1, macro constant: 2, union: 1, variadic: 1/,
    );
    assert.ok(dts.includes(`type Ptr_Node = { readonly __brand: 'Node' };`), 'struct brand');
    assert.ok(
      dts.includes(`type Ptr_Point = { readonly __brand: 'Point' };`),
      'anonymous-struct brand',
    );
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
      'open_node',
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
  'end-to-end: every emitted declaration passes the real gate classifier',
  NEEDS_CLANG,
  () => {
    const { dts } = generateSample();
    const { program, sourceFile } = createProgram(dts, '/gen.d.ts');
    const checker = program.getTypeChecker();
    let count = 0;
    for (const stmt of sourceFile.statements) {
      if (!ts.isFunctionDeclaration(stmt)) {
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
    assert.equal(count, 5, 'all five emitted functions checked');
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
