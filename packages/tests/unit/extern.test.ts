/* Task 7.1 steps 4–5: the extern surface below the decision fixtures.
 *
 * Decision fixtures pin verdicts per file; this file pins the two things a verdict cannot see:
 * the classifier's whole refusal matrix (one source per case, no helper file needed — placement
 * is the gate's job, not the classifier's) and the emitted C's shape (the string lifetimes, the
 * errno sequence, and the bool/void spellings no portable system function can execution-prove).
 * Execution proofs live in the extern_libm goldens; the one runtime path they cannot reach (a
 * dynamic argument failing its boundary check) runs here, against a real binary.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import * as ts from 'typescript';
import { build, compileToC } from '../../compiler/src/cli/build.ts';
import { explainFile } from '../../compiler/src/cli/explain.ts';
import type { ExternClassified } from '../../compiler/src/frontend/extern.ts';
import { classifyExternDeclaration } from '../../compiler/src/frontend/extern.ts';
import { createProgram, NATIVE_ONLY } from './helpers.ts';

/** Classify the first function declaration of a single-file program. The declaration sits in
 * `/test.ts` rather than a `.d.ts` on purpose: placement is the gate's refusal (STA1121),
 * and the classifier must answer the signature question the same wherever it is asked. */
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
  cName: string;
  params: readonly string[];
  ret: string;
  error: string | undefined;
} {
  const classified = classifyFirst(source);
  assert.equal(classified.ok, true, `expected acceptance: ${JSON.stringify(classified)}`);
  if (!classified.ok) {
    throw new Error('unreachable');
  }
  const { signature } = classified;
  return {
    cName: signature.cName,
    params: [...signature.params],
    ret: signature.ret,
    error: signature.error,
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

void test('the covered scalar positions map to their ABI kinds under the TS name', () => {
  assert.deepEqual(
    assertOk('/** @statorExtern */\ndeclare function add(a: number, b: number): number;'),
    { cName: 'add', params: ['number', 'number'], ret: 'number', error: undefined },
  );
  assert.deepEqual(assertOk('/** @statorExtern */\ndeclare function flag(x: number): boolean;'), {
    cName: 'flag',
    params: ['number'],
    ret: 'boolean',
    error: undefined,
  });
  assert.deepEqual(assertOk('/** @statorExtern */\ndeclare function done(x: number): void;'), {
    cName: 'done',
    params: ['number'],
    ret: 'void',
    error: undefined,
  });
});

void test('the tag override renames the C symbol and the CString brands map by alias', () => {
  const brands =
    'type CString = string & { readonly __statorCstr: "CString" };\n' +
    'type CStringOwned = string & { readonly __statorCstrOwned: "CStringOwned" };\n';
  assert.deepEqual(
    assertOk(`${brands}/** @statorExtern c_atof */\ndeclare function numOf(s: CString): number;`),
    { cName: 'c_atof', params: ['cstring'], ret: 'number', error: undefined },
  );
  assert.deepEqual(
    assertOk(`${brands}/** @statorExtern */\ndeclare function take(p: CStringOwned): void;`),
    { cName: 'take', params: ['cstring-owned'], ret: 'void', error: undefined },
  );
  assert.deepEqual(
    assertOk(`${brands}/** @statorExtern c_echo */\ndeclare function echo(s: CString): CString;`),
    { cName: 'c_echo', params: ['cstring'], ret: 'cstring', error: undefined },
  );
});

void test('each error convention is admitted on the return it reads', () => {
  const decl = (convention: string, ret: string): string =>
    `/** @statorExtern @statorError ${convention} */\ndeclare function f(): ${ret};`;
  assert.equal(assertOk(decl('nonzero', 'number')).error, 'nonzero');
  assert.equal(assertOk(decl('negative', 'number')).error, 'negative');
  assert.equal(assertOk(decl('errno', 'number')).error, 'errno');
  assert.equal(assertOk(decl('errno', 'void')).error, 'errno');
  const brands = 'type CString = string & { readonly __statorCstr: "CString" };\n';
  assert.equal(
    assertOk(`${brands}/** @statorExtern @statorError null */\ndeclare function f(): CString;`)
      .error,
    'null',
  );
});

void test('every refusal kind keeps its never-code', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['declare function f(x: unknown): number;', 'STA1114'],
    ['declare function f(o: { x: number }): number;', 'STA1115'],
    ['declare function f(a: number[]): number;', 'STA1116'],
    ['declare function f(cb: () => void): number;', 'STA1117'],
    ['declare function f(s: string): number;', 'STA1118'],
    // STA1119, one per shape the catch-all owns.
    ['declare function f(v: void): number;', 'STA1119'],
    [
      'type CStringOwned = string & { readonly __statorCstrOwned: "CStringOwned" };\n' +
        'declare function f(): CStringOwned;',
      'STA1119',
    ],
    ['/** @statorExtern 123abc */\ndeclare function f(): number;', 'STA1119'],
    ['/** @statorExtern @statorError bogus */\ndeclare function f(): number;', 'STA1119'],
    [
      '/** @statorExtern @statorError nonzero @statorError errno */\ndeclare function f(): number;',
      'STA1119',
    ],
    ['/** @statorExtern @statorError nonzero */\ndeclare function f(): boolean;', 'STA1119'],
    ['/** @statorExtern @statorError null */\ndeclare function f(): number;', 'STA1119'],
    ['/** @statorExtern @statorError nonzero */\ndeclare function f(): void;', 'STA1119'],
    ['declare function f(d: Date): number;', 'STA1119'],
    // STA1120: printf-style varargs have no sound signature, permanently.
    ['declare function f(fmt: string, ...rest: number[]): number;', 'STA1120'],
  ];
  for (const [decl, code] of cases) {
    assertRefused(`/** @statorExtern */\n${decl}`, code);
  }
});

void test('a branded pointer classifies as a pointer, not as a refusal', () => {
  const classified = classifyFirst(
    'type sqlite3 = { readonly __brand: "sqlite3" };\n' +
      '/** @statorExtern */\ndeclare function f(db: sqlite3): number;',
  );
  assert.equal(classified.ok, true);
  if (!classified.ok) {
    throw new Error('unreachable');
  }
  assert.deepEqual([...classified.signature.params], ['pointer']);
});

void test('an unmarked declaration is not an extern signature', () => {
  // No marker: the classifier still answers (the gate only calls it on marked declarations),
  // mapping the signature as written rather than inventing a refusal.
  const classified = classifyFirst('declare function add(a: number, b: number): number;');
  assert.equal(classified.ok, true);
});

/** A two-file program (entry + `.d.ts` helper) under a scratch directory: the only shape that
 * exercises placement, the call-site gate, and the lowering together. */
function writeExternProgram(
  files: Readonly<Record<string, string>>,
  entryName = 'main.ts',
): {
  work: string;
  entry: string;
} {
  const work = mkdtempSync(join(tmpdir(), 'stator-extern-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(work, name), content);
  }
  const entry = join(work, entryName);
  return { work, entry };
}

const DIRECT_HELPER =
  'type CString = string & { readonly __statorCstr: "CString" };\n' +
  'type CStringOwned = string & { readonly __statorCstrOwned: "CStringOwned" };\n' +
  '/** @statorExtern */\ndeclare function extSqrt(x: number): number;\n' +
  '/** @statorExtern c_atof */\ndeclare function extAtof(s: CString): number;\n' +
  '/** @statorExtern @statorError errno */\ndeclare function extErrno(x: number): number;\n' +
  // Valid but unlinkable spellings for the white-box emission tests (bool/void have no
  // portable system spelling, and the transfer/convention cases need their own shapes):
  // decision fixtures never call these, and the declaration walk stays silent on them.
  '/** @statorExtern */\ndeclare function extFlag(x: number): boolean;\n' +
  '/** @statorExtern */\ndeclare function extTakesBool(b: boolean): number;\n' +
  '/** @statorExtern */\ndeclare function extDone(x: number): void;\n' +
  '/** @statorExtern @statorError nonzero */\n' +
  'declare function extCheckStr(s: CString): number;\n' +
  '/** @statorExtern */\ndeclare function extTake(s: CStringOwned): void;\n';

void test('explain marks every compiled extern call as an unchecked boundary', async () => {
  const { work, entry } = writeExternProgram({
    'main.ts':
      '/// <reference path="./helper.d.ts" />\n' +
      'console.log(extSqrt(4));\n' +
      'console.log(extAtof("3.5" as CString));\n' +
      'export {};\n',
    'helper.d.ts': DIRECT_HELPER,
  });
  try {
    const result = await explainFile(entry, 'ts');
    assert.equal(result.verdict, 'static');
    assert.deepEqual(result.externCalls, [
      { name: 'extSqrt', line: 2 },
      // The audit names the C symbol, not the TS one: the foreign code that runs is `c_atof`.
      { name: 'c_atof', line: 3 },
    ]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

void test('a dynamically-typed argument makes the file dynamic, flag included', async () => {
  const { work, entry } = writeExternProgram(
    {
      'main.js':
        '/// <reference path="./helper.d.ts" />\n' +
        'function identity(v) {\n  return v;\n}\n' +
        'console.log(extSqrt(identity(9)));\n',
      'helper.d.ts': DIRECT_HELPER,
    },
    'main.js',
  );
  try {
    // js mode: the checker suppression lets the unknown reach the call, where the boundary
    // check (STA2001 on mismatch) narrows it — and the check is what makes the file dynamic.
    const result = await explainFile(entry, 'js');
    assert.equal(result.verdict, 'dynamic');
    assert.deepEqual(result.externCalls, [{ name: 'extSqrt', line: 5 }]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

void test('an optional call to an extern is STA1217 in the call arm too', async () => {
  const { work, entry } = writeExternProgram({
    'main.ts': '/// <reference path="./helper.d.ts" />\nconsole.log(extSqrt?.(4));\nexport {};\n',
    'helper.d.ts': DIRECT_HELPER,
  });
  try {
    const result = await explainFile(entry, 'ts');
    assert.deepEqual([result.verdict, result.code], ['not-yet', 'STA1217']);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

void test('bool and void externs emit unboxed C calls with matching prototypes', async () => {
  const { work, entry } = writeExternProgram({
    'main.ts':
      '/// <reference path="./helper.d.ts" />\n' +
      'console.log(extFlag(1));\n' +
      'console.log(extTakesBool(true));\n' +
      'extDone(2);\nexport {};\n',
    'helper.d.ts': DIRECT_HELPER,
  });
  try {
    const compiled = await compileToC(entry, 'ts');
    assert.ok(compiled !== null, 'a valid extern program emits C');
    const c = compiled.c;
    // No portable system function spells these, so the binary cannot link — but the SHAPE is
    // fully checkable: the prototype, the unboxed argument, and the boxed result.
    assert.ok(c.includes('bool extFlag(double);'), 'bool forward declaration');
    assert.ok(c.includes('void extDone(double);'), 'void forward declaration');
    assert.ok(
      c.includes('extTakesBool(jsrt_as_bool('),
      'a boolean argument unboxes without a jsrt_value detour',
    );
    assert.ok(c.includes('extDone(jsrt_to_number('), 'a void call still unboxes its argument');
    assert.ok(c.includes('jsrt_bool('), 'a boolean return boxes back');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

void test('a borrowed copy is freed before the throw; a transfer never is', async () => {
  const { work, entry } = writeExternProgram({
    'main.ts':
      '/// <reference path="./helper.d.ts" />\n' +
      'console.log(extCheckStr("hi" as CString));\n' +
      'extTake("bye" as CStringOwned);\n' +
      'export {};\n',
    'helper.d.ts': DIRECT_HELPER,
  });
  try {
    const compiled = await compileToC(entry, 'ts');
    assert.ok(compiled !== null, 'a valid extern program emits C');
    const c = compiled.c;
    assert.ok(c.includes('#include <stdlib.h>'), 'free needs stdlib, pulled in only when owed');
    const toCstr = c.indexOf('jsrt_string_to_cstr(');
    // The call, not the forward declaration: search the assignment the statement makes.
    const call = c.indexOf('= extCheckStr(');
    const free = c.indexOf('free(_jsrt_exc_');
    const throwing = c.indexOf('jsrt_throw_error(&jsrt_class_error, "extern call');
    assert.ok(
      toCstr !== -1 && call !== -1 && free !== -1 && throwing !== -1,
      'the borrow path has all four steps',
    );
    // The lifetime order steps 3–5 rest on: convert, call, free, and only then the throw — so
    // the landing pad the pending check jumps to is already clean when it is taken.
    assert.ok(
      toCstr < call && call < free && free < throwing,
      'temporaries free before any throw, on every exit path',
    );
    // Exactly one free: the borrow. The transfer's copy belongs to the callee now.
    assert.equal(c.match(/free\(_jsrt_exc_/g)?.length ?? 0, 1);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

void test('the errno sequence zeroes, calls, reads immediately, then checks', async () => {
  const { work, entry } = writeExternProgram({
    'main.ts': '/// <reference path="./helper.d.ts" />\nconsole.log(extErrno(4));\nexport {};\n',
    'helper.d.ts': DIRECT_HELPER,
  });
  try {
    const compiled = await compileToC(entry, 'ts');
    assert.ok(compiled !== null, 'a valid extern program emits C');
    const c = compiled.c;
    assert.ok(c.includes('#include <errno.h>'), 'errno needs its header, pulled in only when owed');
    const zero = c.indexOf('errno = 0;');
    const call = c.indexOf('extErrno(jsrt_to_number(');
    const read = c.indexOf('= errno;');
    // The check reads the saved local, not errno a second time: search past the read itself,
    // whose declaration line names the same local.
    const check = c.indexOf('!= 0', read);
    const throwing = c.indexOf('failed: errno set');
    assert.ok(
      zero !== -1 && call !== -1 && read !== -1 && check !== -1 && throwing !== -1,
      'the errno sequence has all five steps',
    );
    // FFI.md section 4's sequence, verbatim: the read precedes every other runtime call, and
    // the value it read — not a re-read after the frees — is what the check tests.
    assert.ok(zero < call && call < read && read < check, 'zero, call, immediate read, check');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

void test(
  'a dynamic argument that fails its boundary check aborts with STA2001',
  NATIVE_ONLY,
  async () => {
    const work = mkdtempSync(join(tmpdir(), 'stator-extern-2001-'));
    try {
      const entry = join(work, 'main.js');
      // The C symbol is real (libm) so the binary links; the boundary check fires first, so the
      // call it guards never runs.
      writeFileSync(
        join(work, 'helper.d.ts'),
        '/** @statorExtern sqrt */\ndeclare function extSqrt(x: number): number;\n',
      );
      writeFileSync(
        entry,
        '/// <reference path="./helper.d.ts" />\n' +
          'function identity(v) {\n  return v;\n}\n' +
          'console.log(extSqrt(identity("nope")));\n',
      );
      const out = join(work, 'app');
      const status = await build({ entry, out, mode: 'js', emitCOnly: false, keepC: false });
      assert.equal(status, 0, 'a dynamic extern argument compiles; the check is at run time');
      const run = spawnSync(out, [], { encoding: 'utf8' });
      assert.notEqual(run.status, 0, 'a mismatched argument must not return a value');
      assert.match(run.stderr, /STA2001/, 'the existing boundary trap, not a new mechanism');
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  },
);
