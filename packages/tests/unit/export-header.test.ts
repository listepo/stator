/* Task 7.2 steps 1–2: `--emit-header` — the reverse ABI mapping, the export decision, and
 * determinism (plan.md §10).
 *
 * Mapping and refusal verdicts run in-process against `collectUnitExports` (no toolchain);
 * the Check's shape — `--emit-header` on a fixture producing the expected header plus
 * diagnostics — runs through the real CLI behind NATIVE_ONLY, including the byte-identical
 * double build that proves step 8's determinism across runs rather than within one.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  collectUnitExports,
  defaultUnitName,
  EXPORT_ABI_VERSION,
  exportCName,
  exportVersionDefinition,
  exportVersionSymbol,
  renderHeader,
  sanitizeUnitName,
  type UnitExports,
} from '../../compiler/src/frontend/export.ts';
import { createProgram, NATIVE_ONLY } from './helpers.ts';

const CLI = fileURLToPath(new URL('../../compiler/src/cli/main.ts', import.meta.url));

/** The C-visible set of a single-file entry: the unit is fixed so every assertion pins the
 * mangling, not the defaulting (which has its own test). */
function collect(source: string, unit = 'u'): UnitExports {
  const { program, sourceFile } = createProgram(source);
  return collectUnitExports(sourceFile, program.getTypeChecker(), unit, 'ts');
}

function codesOf(exports: UnitExports): string[] {
  return exports.diagnostics.map((d) => d.code);
}

void test('the default unit is the entry basename, sanitized to a C identifier', () => {
  assert.equal(defaultUnitName('/some/dir/widget.ts'), 'widget');
  assert.equal(defaultUnitName('main.js'), 'main');
  assert.equal(exportCName('widget', 'add'), 'stator_widget_add');
  assert.equal(defaultUnitName('/d/my-lib.ts'), 'my_lib');
  // An explicit --unit-name sanitizes the same way, minus the leading-digit rule: the unit
  // never starts an identifier (`stator_` precedes it), so `9lives` stays usable.
  assert.equal(sanitizeUnitName('my-lib!'), 'my_lib_');
  assert.equal(sanitizeUnitName('9lives'), '9lives');
  assert.equal(sanitizeUnitName(''), '_');
  assert.equal(sanitizeUnitName(defaultUnitName('/d/my-lib.ts')), 'my_lib');
});

void test('exported foo from unit m mangles to stator_m_foo, sanitized totally', () => {
  assert.equal(exportCName('m', 'foo'), 'stator_m_foo');
  // `$` is legal in a TS name but not in C, and non-ASCII scrambles the same way, so the
  // mangling is total: every TS name lands on a spellable C symbol (collisions are the
  // STA1124 arm's, not the mangling's, to refuse).
  assert.equal(exportCName('u', '$foo'), 'stator_u__foo');
  assert.equal(exportCName('u', 'föö'), 'stator_u_f__');
  // A unit never starts an identifier (`stator_` precedes it), so a leading digit survives.
  assert.equal(exportCName('9lives', 'foo'), 'stator_9lives_foo');
  // A C keyword as a parameter name gains a leading underscore; the function symbol needs
  // none, since the `stator_<unit>_` prefix cannot be a keyword.
  const header = renderHeader(collect('export function f(int: number): number { return int; }\n'));
  assert.ok(header.includes('double stator_u_f(double _int);'));
});

void test('an in-table signature spells plain C types under the mangled name', () => {
  const header = renderHeader(
    collect(
      'export function add(a: number, b: number): number { return a + b; }\n' +
        'export function done(x: number): void {}\n' +
        'export function flag(x: number): boolean { return x > 0; }\n',
    ),
  );
  assert.ok(header.includes('double stator_u_add(double a, double b);'));
  assert.ok(header.includes('void stator_u_done(double x);'));
  assert.ok(header.includes('bool stator_u_flag(double x);'));
  assert.ok(header.includes('#include <stdbool.h>'));
  assert.ok(!header.includes('#include "jsrt_value.h"'));
});

void test('a branded pointer and a CString spell the table types', () => {
  const header = renderHeader(
    collect(
      'type db = { readonly __brand: "sqlite3" };\n' +
        'type CString = string & { readonly __statorCstr: "CString" };\n' +
        'export function count(h: db): number { return 0; }\n' +
        'export function size(s: CString): number { return 0; }\n',
    ),
  );
  assert.ok(header.includes('double stator_u_count(void * h);'));
  assert.ok(header.includes('double stator_u_size(const char * s);'));
});

void test('anything outside the table falls back to jsrt_value, per position', () => {
  const header = renderHeader(
    collect(
      'export function greet(name: string): string { return name; }\n' +
        'export function first(o: { x: number }): number { return o.x; }\n' +
        'export function get(key: string): unknown { return key; }\n',
    ),
  );
  assert.ok(header.includes('jsrt_value stator_u_greet(jsrt_value name);'));
  assert.ok(header.includes('double stator_u_first(jsrt_value o);'));
  assert.ok(header.includes('jsrt_value stator_u_get(jsrt_value key);'));
  assert.ok(header.includes('#include "jsrt_value.h"'));
});

void test('const number and boolean spell extern const; const string spells jsrt_value', () => {
  const header = renderHeader(
    collect(
      'export const VERSION: number = 1;\nexport const ON = true;\nexport const NAME = "s";\n',
    ),
  );
  assert.ok(header.includes('extern const double stator_u_VERSION;'));
  assert.ok(header.includes('extern const bool stator_u_ON;'));
  assert.ok(header.includes('extern const jsrt_value stator_u_NAME;'));
});

void test('a CString const spells one const, not two', () => {
  // `const char *` already carries its `const`; doubling it is a
  // `-Wduplicate-decl-specifier` error in the consumer (found via a C main, not the header).
  const header = renderHeader(
    collect(
      'type CString = string & { readonly __statorCstr: "CString" };\n' +
        'export const TAG: CString = "v1" as CString;\n',
    ),
  );
  assert.ok(header.includes('extern const char * stator_u_TAG;'));
  assert.ok(!header.includes('const const'));
});

void test('classes, generics, closures, and default/re-export forms are STA1122', () => {
  const cases: readonly string[] = [
    'export class Box { v: number = 1; }\n',
    'export function id<T>(x: T): T { return x; }\n',
    'export const f = (x: number): number => x;\n',
    'export default function main(): void {}\n',
    'function local(): void {}\nexport { local };\n',
    'export function bad(...rest: number[]): number { return 0; }\n',
  ];
  for (const source of cases) {
    assert.deepEqual(codesOf(collect(source)), ['STA1122'], `expected STA1122: ${source}`);
  }
});

void test('mutable and non-primitive exported state is STA1123', () => {
  const cases: readonly string[] = [
    'export let count: number = 0;\n',
    'export const point = { x: 1 };\n',
    'export const items = [1, 2];\n',
  ];
  for (const source of cases) {
    assert.deepEqual(codesOf(collect(source)), ['STA1123'], `expected STA1123: ${source}`);
  }
});

void test('two exports mangling to one C symbol are STA1124', () => {
  // `$` is a legal TS identifier character but not a C one, so `$foo` and `_foo` sanitize
  // alike and collide on `stator_u__foo`.
  const sanitized = collect('export function _foo(): void {}\nexport function $foo(): void {}\n');
  assert.deepEqual(codesOf(sanitized), ['STA1124']);
  // Two bodies under one name collide the same way at the header step (the real pipeline
  // stops earlier at the checker's duplicate-implementation error; this pins the arm).
  const duplicate = collect(
    'export function dup(a: number): number { return a; }\n' +
      'export function dup(a: number): number { return a; }\n',
  );
  assert.deepEqual(codesOf(duplicate), ['STA1124']);
  // An overload group is one export, not a collision: bodiless signatures are skipped and
  // the implementation carries the export even when only the overloads name it.
  const overload: UnitExports = collect(
    'export function f(x: number): number;\nexport function f(x: string): string;\n' +
      'export function f(x: unknown): unknown { return x; }\n',
  );
  assert.deepEqual(codesOf(overload), []);
  assert.equal(overload.functions.length, 1);
});

void test('STA1124 covers the collision matrix: fn/const and const/const share one table', () => {
  // Functions and consts claim from the same `seen` table, so a sanitized collision across
  // the two kinds refuses the same way as within one kind.
  const fnConst = collect('export function foo_bar(): void {}\nexport const foo$bar = 1;\n');
  assert.deepEqual(codesOf(fnConst), ['STA1124']);
  const constConst = collect('export const foo_bar = 1;\nexport const foo$bar = 2;\n');
  assert.deepEqual(codesOf(constConst), ['STA1124']);
  // Non-ASCII scrambles like `$` does: `föö` and `f__` share `stator_u_f__`.
  const unicode = collect('export function föö(): void {}\nexport function f__(): void {}\n');
  assert.deepEqual(codesOf(unicode), ['STA1124']);
});

void test('the header says single-threaded v0 out loud, naming T10.2', () => {
  const header = renderHeader(
    collect('export function add(a: number, b: number): number { return a + b; }\n'),
  );
  assert.ok(header.includes('v0 is single-threaded:'));
  assert.ok(header.includes('calling in from a second thread is undefined behavior until T10.2.'));
});

void test('the header declares the ABI-identity symbol the object defines', () => {
  // Pinned at 0: bumping the export ABI means a new symbol name, so the bump edits this
  // test, the header, and the recorded link proof together — never silently.
  assert.equal(EXPORT_ABI_VERSION, 0);
  assert.equal(exportVersionSymbol('m'), 'stator_m_abi_v0');
  assert.equal(
    exportVersionDefinition('m'),
    '/* ABI identity for `--emit-header` consumers (plan §10 Task 7.2 step 7). */\n' +
      'const int stator_m_abi_v0 = 0;\n',
  );
  const header = renderHeader(
    collect('export function add(a: number, b: number): number { return a + b; }\n', 'm'),
  );
  assert.ok(header.includes('double stator_m_add(double a, double b);'));
  assert.ok(header.includes('extern const int stator_m_abi_v0;'));
});

void test('refusals carry a span, the mode, and the never class', () => {
  const exports = collect('export class Box { v: number = 1; }\n');
  assert.equal(exports.diagnostics.length, 1);
  const [diag] = exports.diagnostics;
  assert.ok(diag !== undefined);
  assert.equal(diag.code, 'STA1122');
  assert.equal(diag.class, 'never');
  assert.equal(diag.mode, 'ts');
  assert.equal(diag.line, 1);
});

void test('the same input collects to a byte-identical header across runs', () => {
  const source =
    'export function add(a: number, b: number): number { return a + b; }\n' +
    'export function greet(name: string): string { return name; }\n' +
    'export const VERSION: number = 1;\n';
  const first = renderHeader(collect(source, 'widget'));
  const second = renderHeader(collect(source, 'widget'));
  assert.equal(first, second);
  assert.ok(Buffer.from(first, 'utf8').equals(Buffer.from(second, 'utf8')));
  assert.ok(!first.includes(String(Date.now())), 'no timestamps can leak into the header');
});

interface Spawned {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function statorBuild(args: readonly string[]): Spawned {
  const run = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

const CLEAN_FIXTURE =
  'export function add(a: number, b: number): number {\n  return a + b;\n}\n' +
  'export function truth(): boolean {\n  return true;\n}\n' +
  'export function describe(x: unknown): string {\n  return typeof x;\n}\n' +
  'export const VERSION: number = 1;\n' +
  'console.log(add(1, 2));\n';

const EXPECTED_HEADER =
  '#ifndef STATOR_WIDGET_H\n' +
  '#define STATOR_WIDGET_H\n' +
  '\n' +
  "/* Generated by `stator build --emit-header`: the C ABI view of unit `widget`'s exports.\n" +
  ' * An exported function whose whole signature is in the ABI table spells plain C types;\n' +
  ' * any other position crosses as jsrt_value (docs/FFI.md).\n' +
  ' * Call stator_widget_init() once before any other symbol: calling an exported\n' +
  ' * function first is undefined behavior. Init is idempotent; a second call is a no-op.\n' +
  ' * After every fallible call, read stator_widget_last_error(): NULL means success;\n' +
  ' * non-NULL is the thrown value rendered as text, valid until the next call, and the\n' +
  ' * call answered its zero-value sentinel (0.0, false, NULL, JSRT_UNDEFINED).\n' +
  ' * A returned `const char *` is malloc-owned: the caller frees it. A returned\n' +
  " * jsrt_value is live until the next call unless rooted in the caller's own JSRT_FRAME.\n" +
  ' * v0 is single-threaded:\n' +
  ' * calling in from a second thread is undefined behavior until T10.2. */\n' +
  '\n' +
  '#include <stdbool.h>\n' +
  '#include "jsrt_value.h"\n' +
  '\n' +
  '/* ABI identity (plan §10 Task 7.2 step 7): the object defines this symbol, so a header from one\n' +
  ' * build linked against an object from another fails at link time instead of at runtime. */\n' +
  'extern const int stator_widget_abi_v0;\n' +
  '\n' +
  'void stator_widget_init(void);\n' +
  'const char *stator_widget_last_error(void);\n' +
  '\n' +
  'double stator_widget_add(double a, double b);\n' +
  'bool stator_widget_truth(void);\n' +
  'jsrt_value stator_widget_describe(jsrt_value x);\n' +
  'extern const double stator_widget_VERSION;\n' +
  '\n' +
  '#endif\n';

void test(
  '--emit-header on a clean fixture writes the expected header and an object',
  NATIVE_ONLY,
  () => {
    const work = mkdtempSync(join(tmpdir(), 'stator-export-'));
    try {
      const entry = join(work, 'widget.ts');
      const headerPath = join(work, 'widget.h');
      const out = join(work, 'widget.o');
      writeFileSync(entry, CLEAN_FIXTURE);
      const build = statorBuild([
        'build',
        entry,
        '-o',
        out,
        '--emit-header',
        headerPath,
        '--unit-name',
        'widget',
        '--keep-c',
      ]);
      assert.equal(build.status, 0, build.stderr);
      assert.equal(readFileSync(headerPath, 'utf8'), EXPECTED_HEADER);
      assert.ok(existsSync(out), 'with --emit-header, -o names a relocatable object');
      // The object defines the ABI-identity symbol the header declares, so the two agree.
      assert.ok(readFileSync(`${out}.c`, 'utf8').includes('const int stator_widget_abi_v0 = 0;'));
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  },
);

void test('--emit-header double build is byte-identical across runs', NATIVE_ONLY, () => {
  const work = mkdtempSync(join(tmpdir(), 'stator-export-det-'));
  try {
    const entry = join(work, 'widget.ts');
    writeFileSync(entry, CLEAN_FIXTURE);
    const first = join(work, 'first.h');
    const second = join(work, 'second.h');
    const firstBuild = statorBuild([
      'build',
      entry,
      '-o',
      join(work, 'first.o'),
      '--emit-header',
      first,
    ]);
    assert.equal(firstBuild.status, 0, firstBuild.stderr);
    const secondBuild = statorBuild([
      'build',
      entry,
      '-o',
      join(work, 'second.o'),
      `--emit-header=${second}`,
    ]);
    assert.equal(secondBuild.status, 0, secondBuild.stderr);
    assert.ok(
      readFileSync(first).equals(readFileSync(second)),
      'same input must emit byte-identical headers',
    );
    // Without `--unit-name` the prefix defaults to the entry basename (`widget.ts`).
    assert.ok(
      readFileSync(first, 'utf8').includes('double stator_widget_add(double a, double b);'),
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

void test(
  '--emit-header on a class export refuses with STA1122 and writes nothing',
  NATIVE_ONLY,
  () => {
    const work = mkdtempSync(join(tmpdir(), 'stator-export-refuse-'));
    try {
      const entry = join(work, 'bad.ts');
      const headerPath = join(work, 'bad.h');
      writeFileSync(
        entry,
        'export function ok(x: number): number {\n  return x;\n}\n' +
          'export class Box {\n  v: number = 1;\n}\n',
      );
      const build = statorBuild([
        'build',
        entry,
        '-o',
        join(work, 'bad.o'),
        `--emit-header=${headerPath}`,
      ]);
      assert.equal(build.status, 1);
      assert.match(build.stderr, /STA1122/);
      assert.ok(!existsSync(headerPath), 'a refused unit writes no header');
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  },
);

void test(
  '--emit-header on colliding exports refuses with STA1124 and writes nothing',
  NATIVE_ONLY,
  () => {
    const work = mkdtempSync(join(tmpdir(), 'stator-export-collide-'));
    try {
      const entry = join(work, 'm.ts');
      const headerPath = join(work, 'm.h');
      const out = join(work, 'm.o');
      writeFileSync(entry, 'export function _foo(): void {}\nexport function $foo(): void {}\n');
      // The `--unit-name` game: the collision is detected on the SANITIZED symbol, so a
      // raw `my-lib!` still refuses on `stator_my_lib___foo` rather than slipping through.
      const build = statorBuild([
        'build',
        entry,
        '-o',
        out,
        `--emit-header=${headerPath}`,
        '--unit-name',
        'my-lib!',
      ]);
      assert.equal(build.status, 1);
      assert.match(build.stderr, /STA1124/);
      assert.match(build.stderr, /stator_my_lib___foo/);
      assert.ok(!existsSync(headerPath), 'a refused unit writes no header');
      assert.ok(!existsSync(out), 'a refused unit writes no object');
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  },
);

void test('--unit-name sets the stator_<unit>_<name> prefix, sanitized', NATIVE_ONLY, () => {
  const work = mkdtempSync(join(tmpdir(), 'stator-export-unit-'));
  try {
    const entry = join(work, 'm.ts');
    const headerPath = join(work, 'm.h');
    writeFileSync(entry, 'export function foo(x: number): number {\n  return x;\n}\n');
    const build = statorBuild([
      'build',
      entry,
      '-o',
      join(work, 'm.o'),
      `--emit-header=${headerPath}`,
      '--unit-name',
      'my-lib!',
    ]);
    assert.equal(build.status, 0, build.stderr);
    const header = readFileSync(headerPath, 'utf8');
    assert.ok(header.includes('double stator_my_lib__foo(double x);'));
    assert.ok(header.includes('extern const int stator_my_lib__abi_v0;'));
    assert.ok(header.includes('#ifndef STATOR_MY_LIB__H'));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

void test('--emit-header without a value is STA0004, not a crash', () => {
  const build = statorBuild(['build', 'x.ts', '-o', 'x', '--emit-header']);
  assert.equal(build.status, 1);
  assert.match(build.stderr, /STA0004/);
});
