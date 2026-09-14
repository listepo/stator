/* Task 7.1 steps 6–7: opaque pointer pass-through (borrow-only) and link plumbing.
 *
 * Decision fixtures pin verdicts per file; goldens prove execution. This file pins what
 * neither can see: the classifier's pointer rows and convention matrix, the `@statorLink`
 * pragma's whole grammar (parsed, gated, and emitted), the emitted C's pointer shape (the
 * `void *` crossing, the bit-pattern box-back, the header include with its skipped forward
 * declaration), and the link line (dedup order, the `--link=` channel, the missing-library
 * hint). Execution proofs live in the extern_ptr golden; the CLI parse errors spawn the real
 * CLI, which exits before any build and needs no toolchain.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { execa } from 'execa';
import {
  build,
  BuildError,
  compileToC,
  dedupLinkLibs,
  withDiagnosticCapture,
} from '../../compiler/src/cli/build.ts';
import { explainFile } from '../../compiler/src/cli/explain.ts';
import type { ExternClassified, LinkPragma } from '../../compiler/src/frontend/extern.ts';
import { classifyExternDeclaration, linkPragmasOf } from '../../compiler/src/frontend/extern.ts';
import { createProgram, NATIVE_ONLY } from './helpers.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(REPO, 'compiler', 'src', 'cli', 'main.ts');

/** Classify the first function declaration of a single-file program (extern.test.ts's
 * pattern: placement is the gate's refusal, so the classifier must answer the signature
 * question wherever it is asked). */
function classifyFirst(source: string): ExternClassified {
  const { program, sourceFile } = createProgram(source);
  const checker = program.getTypeChecker();
  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt)) {
      return classifyExternDeclaration(stmt, checker);
    }
  }
  throw new Error('no function declaration in test source');
}

function assertOk(source: string): {
  params: readonly string[];
  ret: string;
  error: string | undefined;
} {
  const classified = classifyFirst(source);
  assert.equal(classified.ok, true, `expected acceptance: ${JSON.stringify(classified)}`);
  if (!classified.ok) {
    throw new Error('unreachable');
  }
  return {
    params: [...classified.signature.params],
    ret: classified.signature.ret,
    error: classified.signature.error,
  };
}

function assertRefused(source: string, code: string): void {
  const classified = classifyFirst(source);
  assert.equal(classified.ok, false, `expected refusal: ${JSON.stringify(classified)}`);
  if (classified.ok) {
    throw new Error('unreachable');
  }
  assert.equal(classified.code, code);
}

/** The `@statorLink` lines of a `.d.ts` source, without a gate or a build. */
function pragmasOf(source: string): readonly LinkPragma[] {
  const { sourceFile } = createProgram(source, '/test.d.ts');
  return linkPragmasOf(sourceFile);
}

/** A scratch program (entry + helper files): the only shape that exercises the pragma, the
 * call-site gate, and the lowering together. */
function writeLinkProgram(
  files: Readonly<Record<string, string>>,
  entryName = 'main.ts',
): {
  work: string;
  entry: string;
} {
  const work = mkdtempSync(join(tmpdir(), 'stator-link-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(work, name), content);
  }
  return { work, entry: join(work, entryName) };
}

const BRAND = 'type Db = { readonly __brand: "Db" };\n';
const IBRAND = 'interface IDb { readonly __brand: "IDb" };\n';

void test('a branded pointer maps to the pointer kind in both positions', () => {
  assert.deepEqual(assertOk(`${BRAND}/** @statorExtern */\ndeclare function f(db: Db): Db;`), {
    params: ['pointer'],
    ret: 'pointer',
    error: undefined,
  });
});

void test('an interface brand maps the same as an alias brand', () => {
  assert.deepEqual(
    assertOk(`${IBRAND}/** @statorExtern */\ndeclare function f(db: IDb): number;`),
    { params: ['pointer'], ret: 'number', error: undefined },
  );
});

void test('the null convention guards a pointer return; numeric ones do not fit it', () => {
  assert.deepEqual(
    assertOk(
      `${BRAND}/** @statorExtern @statorError null */\ndeclare function f(seed: number): Db;`,
    ),
    { params: ['number'], ret: 'pointer', error: 'null' },
  );
  assertRefused(
    `${BRAND}/** @statorExtern @statorError nonzero */\ndeclare function f(db: Db): Db;`,
    'STA1119',
  );
  assert.deepEqual(
    assertOk(`${BRAND}/** @statorExtern @statorError errno */\ndeclare function f(db: Db): void;`),
    { params: ['pointer'], ret: 'void', error: 'errno' },
  );
});

void test('a flags pragma parses in order with quote grouping', () => {
  const pragmas = pragmasOf(
    '// @statorLink: -lsqlite3 -L/opt/x/lib\n' +
      '//   @statorLink   -lfoo "/p a t h/x.a"\n' +
      'declare function f(): void;\n',
  );
  assert.deepEqual(pragmas, [
    { kind: 'flags', flags: ['-lsqlite3', '-L/opt/x/lib'], line: 1, col: 4 },
    { kind: 'flags', flags: ['-lfoo', '/p a t h/x.a'], line: 2, col: 6 },
  ]);
});

void test('angle and bare-quote headers parse; a pathed quote resolves against the file', () => {
  const pragmas = pragmasOf(
    '// @statorLink #include <sqlite3.h>\n' +
      '// @statorLink #include "local.h"\n' +
      '// @statorLink #include "sub/dir/bind.h"\n' +
      'declare function f(): void;\n',
  );
  // The pseudo-file is `/test.d.ts`, so the pathed quote anchors at the root; what the test
  // pins is the RULE (absolute, forward slashes), not one machine's checkout path.
  const anchored = `"${resolve(dirname('/test.d.ts'), 'sub/dir/bind.h').replace(/\\/g, '/')}"`;
  assert.deepEqual(pragmas, [
    { kind: 'header', header: '<sqlite3.h>', line: 1, col: 4 },
    { kind: 'header', header: '"local.h"', line: 2, col: 4 },
    { kind: 'header', header: anchored, line: 3, col: 4 },
  ]);
});

void test('malformed pragmas parse as invalid, and ordinary comments are not pragmas', () => {
  const kinds = (source: string): readonly string[] =>
    pragmasOf(source).map((pragma) => pragma.kind);
  assert.deepEqual(kinds('// @statorLink\ndeclare function f(): void;\n'), ['invalid']);
  assert.deepEqual(kinds('// @statorLink #include sqlite3.h\ndeclare function f(): void;\n'), [
    'invalid',
  ]);
  assert.deepEqual(kinds('// @statorLink #include "a.h" "b.h"\ndeclare function f(): void;\n'), [
    'invalid',
  ]);
  assert.deepEqual(kinds('// @statorLink #frobnicate -lfoo\ndeclare function f(): void;\n'), [
    'invalid',
  ]);
  assert.deepEqual(kinds('// @statorLink -lfoo "oops\ndeclare function f(): void;\n'), ['invalid']);
  assert.deepEqual(
    pragmasOf(
      '// just a comment\n/* @statorLink -lfoo */\n/** @statorLink -lfoo */\ndeclare function f(): void;\n',
    ),
    [],
  );
});

void test('a valid pragma with a pointer call explains static in both modes', async () => {
  const helper =
    '// @statorLink: -lsqlite3\n' +
    '// @statorLink #include <sqlite3.h>\n' +
    BRAND +
    '/** @statorExtern db_open */\ndeclare function extOpen(seed: number): Db;\n' +
    '/** @statorExtern db_get */\ndeclare function extGet(db: Db): number;\n';
  for (const mode of ['ts', 'js'] as const) {
    const { work, entry } = writeLinkProgram({
      'main.ts': '/// <reference path="./helper.d.ts" />\nconsole.log(extGet(extOpen(7)));\n',
      'helper.d.ts': helper,
    });
    try {
      const result = await explainFile(entry, mode);
      assert.equal(result.verdict, 'static', `mode ${mode}: ${JSON.stringify(result)}`);
      assert.deepEqual(result.externCalls, [
        { name: 'db_open', line: 2 },
        { name: 'db_get', line: 2 },
      ]);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
});

void test('a retained-handle use stays STA1217: aliasing the extern as a value', async () => {
  const helper = `${BRAND}/** @statorExtern db_open */\ndeclare function extOpen(seed: number): Db;\n`;
  for (const mode of ['ts', 'js'] as const) {
    const { work, entry } = writeLinkProgram({
      'main.ts':
        '/// <reference path="./helper.d.ts" />\nconst opener = extOpen;\nconsole.log(typeof opener);\n',
      'helper.d.ts': helper,
    });
    try {
      const result = await explainFile(entry, mode);
      assert.deepEqual(
        [result.verdict, result.code],
        ['not-yet', 'STA1217'],
        `mode ${mode}: ${JSON.stringify(result)}`,
      );
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
});

async function explainError(
  files: Readonly<Record<string, string>>,
): Promise<{ verdict: string; code?: string }> {
  const { work, entry } = writeLinkProgram(files);
  try {
    return await explainFile(entry, 'ts');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

void test('a malformed pragma is STA1119 at its own line', async () => {
  const result = await explainError({
    'main.ts': '/// <reference path="./helper.d.ts" />\nconsole.log(1);\nexport {};\n',
    'helper.d.ts':
      '/** @statorExtern */\ndeclare function extF(): number;\n// @statorLink #include sqlite3.h\n',
  });
  assert.deepEqual([result.verdict, result.code], ['error', 'STA1119']);
});

void test('a pragma in a file with no extern declaration is STA1119', async () => {
  const result = await explainError({
    'main.ts': '/// <reference path="./helper.d.ts" />\nconsole.log(1);\nexport {};\n',
    'helper.d.ts': '// @statorLink: -lsqlite3\ndeclare function extF(): number;\n',
  });
  assert.deepEqual([result.verdict, result.code], ['error', 'STA1119']);
});

void test('a second header in one file is STA1119', async () => {
  const result = await explainError({
    'main.ts': '/// <reference path="./helper.d.ts" />\nconsole.log(1);\nexport {};\n',
    'helper.d.ts':
      '// @statorLink #include <a.h>\n// @statorLink #include <b.h>\n/** @statorExtern */\ndeclare function extF(): number;\n',
  });
  assert.deepEqual([result.verdict, result.code], ['error', 'STA1119']);
});

void test('a pointer crosses as void star and boxes back by bit pattern', async () => {
  const { work, entry } = writeLinkProgram({
    'main.ts':
      '/// <reference path="./helper.d.ts" />\n' +
      'const db = extOpen(7);\nconsole.log(extGet(db));\nextClose(db);\nexport {};\n',
    'helper.d.ts':
      BRAND +
      '/** @statorExtern db_open */\ndeclare function extOpen(seed: number): Db;\n' +
      '/** @statorExtern db_get */\ndeclare function extGet(db: Db): number;\n' +
      '/** @statorExtern db_close */\ndeclare function extClose(db: Db): void;\n',
  });
  try {
    const compiled = await compileToC(entry, 'ts');
    assert.ok(compiled !== null, 'a valid pointer program emits C');
    // One forward declaration per symbol, all `void *` where the handle crosses.
    assert.ok(compiled.c.includes('void * db_open(double);'), 'pointer-return declaration');
    assert.ok(compiled.c.includes('double db_get(void *);'), 'pointer-parameter declaration');
    assert.ok(compiled.c.includes('void db_close(void *);'), 'void keeps its spelling');
    // The argument unboxes without a jsrt_value detour, reading the rooted slot.
    assert.ok(compiled.c.includes('db_get(jsrt_ptr('), 'a handle passes untouched');
    // The return travels in a C local and lands in the slot by bit pattern — memcpy
    // semantics in a cast, never through a converter that could read the bits as a value.
    assert.ok(compiled.c.includes('(jsrt_value)(uintptr_t)_jsrt_exr_'), 'bit-pattern box-back');
    // No header was named, so no include beyond the runtime's own.
    assert.ok(!compiled.c.includes('#include <sqlite3.h>'), 'no unasked include');
    assert.deepEqual(compiled.linkFlags, [], 'no pragma, no link flags');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

void test('a named header is included and its symbol gets no forward declaration', async () => {
  const { work, entry } = writeLinkProgram({
    'main.ts':
      '/// <reference path="./helper.d.ts" />\n' +
      '/// <reference path="./plain.d.ts" />\n' +
      'console.log(extMapped(1));\nconsole.log(extPlain(2));\nexport {};\n',
    // One binding file, one library, one header: every extern this file declares is declared
    // by that header, so none gets a forward declaration.
    'helper.d.ts':
      '// @statorLink #include <mylib.h>\n' +
      '/** @statorExtern my_mapped */\ndeclare function extMapped(x: number): number;\n',
    'plain.d.ts': '/** @statorExtern */\ndeclare function extPlain(x: number): number;\n',
  });
  try {
    const compiled = await compileToC(entry, 'ts');
    assert.ok(compiled !== null, 'a valid header program emits C');
    assert.ok(compiled.c.includes('#include <mylib.h>'), 'the binding header is included');
    assert.ok(
      !compiled.c.includes('my_mapped(double);'),
      'no forward declaration under a header (the call itself still names the symbol)',
    );
    assert.ok(
      compiled.c.includes('double extPlain(double);'),
      'a symbol from a headerless file keeps its declaration',
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

void test('a NULL-checked pointer return detects NULL and throws it', async () => {
  const { work, entry } = writeLinkProgram({
    'main.ts': '/// <reference path="./helper.d.ts" />\nconsole.log(extOpen(7));\nexport {};\n',
    'helper.d.ts': `${BRAND}/** @statorExtern db_open @statorError null */\ndeclare function extOpen(seed: number): Db;\n`,
  });
  try {
    const compiled = await compileToC(entry, 'ts');
    assert.ok(compiled !== null, 'a valid null-checked program emits C');
    const check = compiled.c.indexOf('== NULL');
    const throwing = compiled.c.indexOf('failed: NULL return');
    const box = compiled.c.indexOf('(jsrt_value)(uintptr_t)');
    assert.ok(check !== -1 && throwing !== -1 && box !== -1, 'check, throw, and box all present');
    // The check guards the call and the throw reports it: a NULL handle throws rather than
    // becoming a usable value (the box on the NULL path is dead — the pending check unwinds
    // past every consumer).
    assert.ok(check < throwing, 'NULL is detected before it is reported');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

void test('a primitive where a handle belongs is STA4098, like the scalar mismatch', async () => {
  const { work, entry } = writeLinkProgram(
    {
      'main.js': '/// <reference path="./helper.d.ts" />\nconsole.log(extGet(42));\n',
      'helper.d.ts': `${BRAND}/** @statorExtern db_get */\ndeclare function extGet(db: Db): number;\n`,
    },
    'main.js',
  );
  try {
    const { result, stderr } = await withDiagnosticCapture(() => compileToC(entry, 'js'));
    assert.equal(result, null, 'a mistyped handle does not emit C');
    assert.ok(
      stderr.includes('STA4098') && stderr.includes('not an opaque handle'),
      `the mismatch fails closed at compile time: ${stderr}`,
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

void test('duplicate libraries dedup first-wins; everything else passes through', () => {
  assert.deepEqual(dedupLinkLibs(['-lsqlite3', '-lz', '-lsqlite3']), ['-lsqlite3', '-lz']);
  assert.deepEqual(dedupLinkLibs(['-lm', '-L/x', '-L/x', 'a.o', 'a.o']), [
    '-lm',
    '-L/x',
    '-L/x',
    'a.o',
    'a.o',
  ]);
  assert.deepEqual(dedupLinkLibs([]), []);
});

void test(
  'pragma flags reach the link: a linked object answers through the boundary',
  NATIVE_ONLY,
  async () => {
    const work = mkdtempSync(join(tmpdir(), 'stator-link-e2e-'));
    try {
      writeFileSync(
        join(work, 'helper.d.ts'),
        '/** @statorExtern ext_answer */\ndeclare function extAnswer(): number;\n',
      );
      writeFileSync(
        join(work, 'main.ts'),
        '/// <reference path="./helper.d.ts" />\nconsole.log(extAnswer());\nexport {};\n',
      );
      // The two-function shape plan §10 prescribes for its own fixture, shrunk to one symbol:
      // the harness compiles the C itself, so the suite depends on nothing installed.
      writeFileSync(join(work, 'ffi.c'), 'double ext_answer(void) { return 42.0; }\n');
      const cc = process.env['CC'] ?? 'clang';
      const compiled = spawnSync(cc, [
        '-std=c11',
        '-O2',
        '-c',
        join(work, 'ffi.c'),
        '-o',
        join(work, 'ffi.o'),
      ]);
      assert.equal(compiled.status, 0, `the fixture C must compile: ${String(compiled.error)}`);
      const out = join(work, 'app');
      const status = await build({
        entry: join(work, 'main.ts'),
        out,
        mode: 'ts',
        emitCOnly: false,
        keepC: false,
        linkFlags: [join(work, 'ffi.o')],
      });
      assert.equal(status, 0, 'the object on the link line resolves the symbol');
      const run = spawnSync(out, [], { encoding: 'utf8' });
      assert.equal(run.status, 0);
      assert.equal(run.stdout, '42\n');
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  },
);

void test('a missing library fails the link naming the extern flags', NATIVE_ONLY, async () => {
  const { work, entry } = writeLinkProgram({
    'main.ts': 'console.log(1);\nexport {};\n',
  });
  try {
    await assert.rejects(
      () =>
        build({
          entry,
          out: join(work, 'app'),
          mode: 'ts',
          emitCOnly: false,
          keepC: false,
          linkFlags: ['-lstator_missing_lib_xyz'],
        }),
      (error: unknown) => {
        assert.ok(error instanceof BuildError, 'a BuildError carries the failure');
        assert.equal(error.code, 'STA0009');
        assert.ok(
          error.message.includes('-lstator_missing_lib_xyz'),
          `the hint names the flags: ${error.message}`,
        );
        return true;
      },
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

void test('bare and empty --link values are STA0004, before any build', async () => {
  for (const args of [
    ['build', 'main.ts', '-o', 'app', '--link'],
    ['build', 'main.ts', '-o', 'app', '--link='],
  ]) {
    const run = await execa(process.execPath, [CLI, ...args], { reject: false });
    assert.equal(run.exitCode, 1, args.join(' '));
    assert.match(run.stderr, /STA0004/, args.join(' '));
  }
});
