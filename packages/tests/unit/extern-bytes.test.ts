/* plan.md §11c T11.3a: the `Uint8Array` row of the extern table (docs/FFI.md §2) below the
 * decision fixtures and the extern_bytes golden.
 *
 * The fixtures pin verdicts and the golden pins what C sees; this file pins the rest: the
 * classifier's mapping (parameter-only, never an export position), the emitted pair of C
 * arguments with its guard, and the two runtime paths a golden cannot run because the golden
 * runner demands status 0 — a dynamic non-view caught by the lowering's check, and a js-mode lie
 * through a `.ts` parameter caught by the emitter's guard before C reads the view's layout.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import * as ts from 'typescript';
import { compileToC } from '../../compiler/src/cli/build.ts';
import { classifyExternDeclaration, exportAbiKindOf } from '../../compiler/src/frontend/extern.ts';
import { createProgram, NATIVE_ONLY } from './helpers.ts';

const CLI = fileURLToPath(new URL('../../compiler/src/cli/main.ts', import.meta.url));

const HELPER =
  '/** @statorExtern bytes_sum */\ndeclare function extSum(buf: Uint8Array): number;\n' +
  '/** @statorExtern bytes_fill */\n' +
  'declare function extFill(buf: Uint8Array, value: number): void;\n';

function firstFunction(source: string): { decl: ts.FunctionDeclaration; checker: ts.TypeChecker } {
  const { program, sourceFile } = createProgram(source);
  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt)) {
      return { decl: stmt, checker: program.getTypeChecker() };
    }
  }
  throw new Error('no function declaration in test source');
}

function withWork<T>(files: Readonly<Record<string, string>>, body: (work: string) => T): T {
  const work = mkdtempSync(join(tmpdir(), 'stator-bytes-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(work, name), content);
    }
    return body(work);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

test('a Uint8Array parameter is the bytes kind; a Uint8Array return is STA1119', () => {
  const param = firstFunction(
    '/** @statorExtern */\ndeclare function take(b: Uint8Array, n: number): number;',
  );
  const accepted = classifyExternDeclaration(param.decl, param.checker);
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  assert.deepEqual(accepted.ok ? accepted.signature.params : [], ['bytes', 'number']);

  const ret = firstFunction('/** @statorExtern */\ndeclare function make(n: number): Uint8Array;');
  const refused = classifyExternDeclaration(ret.decl, ret.checker);
  assert.equal(refused.ok, false);
  assert.equal(refused.ok ? '' : refused.code, 'STA1119');
});

test('an exported Uint8Array position keeps the jsrt_value form', () => {
  const { decl, checker } = firstFunction(
    'export function f(b: Uint8Array): number { return b.length; }',
  );
  const param = decl.parameters[0];
  assert.ok(param !== undefined);
  assert.equal(exportAbiKindOf(checker.getTypeAtLocation(param), checker, 'param'), undefined);
});

test('a view crosses as its bytes and its length, guarded, with the paired prototype', async () => {
  const c = await withWork(
    {
      'helper.d.ts': HELPER,
      'main.ts':
        '/// <reference path="./helper.d.ts" />\n' +
        'const buf = new Uint8Array(4);\nextFill(buf.subarray(1), 7);\n' +
        'console.log(extSum(buf));\nexport {};\n',
    },
    async (work) => {
      const compiled = await compileToC(join(work, 'main.ts'), 'ts');
      assert.ok(compiled !== null, 'a valid extern program emits C');
      return compiled.c;
    },
  );
  assert.ok(c.includes('double bytes_sum(uint8_t *, size_t);'), 'one TS parameter, two C ones');
  assert.ok(c.includes('void bytes_fill(uint8_t *, size_t, double);'), 'the pair lands in place');
  assert.match(
    c,
    /bytes_sum\(\(void \*\)jsrt_uint8array_bytes\((.+?)\), jsrt_uint8array_count\(\1\)\)/,
    'pointer and length read from the same rooted slot',
  );
  // A proven view is still guarded: the guard is the emitter's, not a boundary-check node.
  assert.equal(c.match(/\(void\)jsrt_check_uint8array\(/g)?.length, 2, 'one guard per call');
  assert.ok(!c.includes('jsrt_std_bytes_'), 'nothing goes byte by byte');
});

test('a dynamic argument is checked once, by the lowering', async () => {
  const c = await withWork(
    {
      'helper.d.ts': HELPER,
      'main.js':
        '/// <reference path="./helper.d.ts" />\n' +
        'function identity(v) {\n  return v;\n}\nconsole.log(extSum(identity(new Uint8Array(2))));\n',
    },
    async (work) => {
      const compiled = await compileToC(join(work, 'main.js'), 'js');
      assert.ok(compiled !== null, 'a dynamic extern argument compiles');
      return compiled.c;
    },
  );
  assert.equal(c.match(/jsrt_check_uint8array\(/g)?.length, 1, 'no second guard');
  assert.ok(!c.includes('(void)jsrt_check_uint8array('), 'the lowering owns this one');
});

/** Build `main.js` in js mode through the CLI (std links only through the driver) and run it. */
function buildAndRunJs(files: Readonly<Record<string, string>>): ReturnType<typeof spawnSync> {
  return withWork(files, (work) => {
    const out = join(work, 'app');
    const build = spawnSync(
      process.execPath,
      [CLI, 'build', join(work, 'main.js'), '--mode=js', '-o', out],
      { encoding: 'utf8' },
    );
    assert.equal(build.status, 0, `build failed:\n${build.stdout}${build.stderr}`);
    return spawnSync(out, [], { encoding: 'utf8', timeout: 30_000 });
  });
}

test(
  'a non-view reaching a Uint8Array extern aborts with STA2001 before C runs',
  NATIVE_ONLY,
  () => {
    // Through std/io: `writeBytes`'s parameter is annotated, so js-mode code hands it anything; the
    // emitter's guard is what stops a string from becoming a wild pointer in the backing.
    const run = buildAndRunJs({
      'main.js':
        'import { writeBytes } from "std/io";\n' +
        'function identity(v) {\n  return v;\n}\n' +
        'writeBytes(1, identity(new Uint8Array([111, 107, 10])));\n' +
        'writeBytes(1, identity("nope"));\n',
    });
    assert.equal(run.stdout, 'ok\n', 'the honest view crossed');
    assert.notEqual(run.status, 0, 'a lie must not reach C');
    assert.equal(run.signal, 'SIGABRT', 'an abort, not a segfault');
    assert.match(String(run.stderr), /STA2001: .* expected Uint8Array, got string/);
  },
);
