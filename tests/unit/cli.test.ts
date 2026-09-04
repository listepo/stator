import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { execaSync } from 'execa';
import { NATIVE_ONLY } from './helpers.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(REPO, 'src', 'cli', 'main.ts');

interface Run {
  readonly status: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
}

/** All process spawning in this file goes through execa (owner directive, plan-notes 187):
 * rejection never throws — a CLI test asserts the failure, it doesn't die from it. */
function spawn(command: string, args: readonly string[], cwd?: string): Run {
  const result = execaSync(command, [...args], {
    reject: false,
    // Byte-exactness is this codebase's testing contract; execa's convenience default would
    // silently eat a trailing '\n' and lie to an assertion comparing against one.
    stripFinalNewline: false,
    ...(cwd ? { cwd } : {}),
  });
  return { status: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}

function stator(...args: string[]): Run {
  return spawn(process.execPath, [CLI, ...args]);
}

function packageJson(): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  assert.ok(typeof parsed === 'object' && parsed !== null, 'package.json must be an object');
  return parsed as Record<string, unknown>;
}

// `void`: node:test returns a promise the runner owns; we are not awaiting it here.
void test('the published binary is named stator even though the package is not', () => {
  const pkg = packageJson();
  assert.deepEqual(pkg['bin'], { stator: 'dist/cli/main.js' });
  assert.equal(pkg['name'], 'statorc', 'npm name "stator" is taken — see plan-notes.md');
});

// `void`: node:test returns a promise the runner owns; we are not awaiting it here.
void test('--version prints the package version', () => {
  const pkg = packageJson();
  const { status, stdout } = stator('--version');
  assert.equal(status, 0);
  assert.equal(stdout.trim(), pkg['version']);
});

// `void`: node:test returns a promise the runner owns; we are not awaiting it here.
void test('--help names both modes', () => {
  const { status, stdout } = stator('--help');
  assert.equal(status, 0);
  assert.match(stdout, /--mode=ts\|js/);
});

// `void`: node:test returns a promise the runner owns; we are not awaiting it here.
void test('an unknown command fails with a stable STA code, not a stack trace', () => {
  const { status, stderr } = stator('frobnicate');
  assert.equal(status, 1);
  assert.match(stderr, /^stator: STA0003 /);
  assert.doesNotMatch(stderr, /at .*\.ts:\d+/, 'diagnostics must never leak a stack trace');
});

// `void`: node:test returns a promise the runner owns; we are not awaiting it here.
void test('an invalid mode is rejected', () => {
  const { status, stderr } = stator('build', 'x.ts', '-o', 'x', '--mode=wasm');
  assert.equal(status, 1);
  assert.match(stderr, /^stator: STA0002 /);
});

// `void`: node:test returns a promise the runner owns; we are not awaiting it here.
void test('build and explain report a missing entry file as a path error', () => {
  // Both commands must fail on the PATH before either tries to build a program, so the user gets
  // "no such file" rather than a checker diagnostic about a file that was never there.
  for (const argv of [
    ['build', 'x.ts', '-o', 'x'],
    ['explain', 'x.ts'],
  ]) {
    const { status, stderr } = stator(...argv);
    assert.equal(status, 1);
    assert.match(stderr, /^stator: STA0007 entry file "x\.ts" does not exist/);
  }
});

// `void`: node:test returns a promise the runner owns; we are not awaiting it here.
void test(
  'a builtin the program never references is not in the binary (Task 3.12)',
  NATIVE_ONLY,
  () => {
    const work = mkdtempSync(join(tmpdir(), 'stator-shake-'));
    try {
      const src = join(work, 'hello.ts');
      const out = join(work, 'hello');
      writeFileSync(src, 'console.log("hello");\n');
      const { status, stderr } = stator('build', src, '-o', out);
      assert.equal(status, 0, stderr);
      // The symbol table's strings live in the file, so a byte search is a portable stand-in for
      // `nm`: a dead-stripped builtin's name is gone, a referenced one's remains.
      const binary = readFileSync(out).toString('latin1');
      // Thin LTO inlines small builtins (`jsrt_print`); the generated main still calls `jsrt_init`.
      assert.ok(binary.includes('jsrt_init'), 'the referenced builtin must survive the link');
      assert.ok(
        !binary.includes('jsrt_map_new'),
        'an unreferenced builtin must be dead-stripped, not dragged in with its object file',
      );
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  },
);

// `void`: node:test returns a promise the runner owns; we are not awaiting it here.
void test('a relative entry path resolves its imports (module graph is cwd-independent)', () => {
  const work = mkdtempSync(join(tmpdir(), 'stator-relative-'));
  try {
    writeFileSync(join(work, 'dep.ts'), 'export function five(): number {\n  return 5;\n}\n');
    writeFileSync(
      join(work, 'entry.ts'),
      'import { five } from "./dep.ts";\nconsole.log(five());\n',
    );
    // The regression: with a relative root the program's fileNames stayed relative while the
    // resolver answered absolute, so every import edge silently missed and legal source died
    // as STA4035 in the lowering.
    const result = spawn(process.execPath, [CLI, 'explain', 'entry.ts', '--json'], work);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"verdict":"static"/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

// Phase 5 step 4 lifted STA2004 for *reads* of an existing field: the shape-table entry points
// walk the class descriptor. Growing a NEW key on a fixed layout still cannot invent a slot, so
// that write stays STA2004 (Phase 8).
void test('a fixed-shape object answers an aliased read of an existing field', NATIVE_ONLY, () => {
  const work = mkdtempSync(join(tmpdir(), 'stator-cli-'));
  try {
    const entry = join(work, 'alias.ts');
    writeFileSync(
      entry,
      'const a: { x: number } = { x: 1 };\nconst b: { x?: number } = a;\nconsole.log(b.x);\n',
    );
    const binary = join(work, 'alias');
    const build = stator('build', entry, '-o', binary);
    assert.equal(build.status, 0, build.stderr);
    const run = spawn(binary, []);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, '1\n');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

void test('adding a new key to a fixed-shape object still aborts with STA2004', NATIVE_ONLY, () => {
  const work = mkdtempSync(join(tmpdir(), 'stator-cli-'));
  try {
    const entry = join(work, 'grow.ts');
    writeFileSync(
      entry,
      'const a: { x: number } = { x: 1 };\nconst b: { x?: number; y?: number } = a;\nb.y = 2;\nconsole.log(b.y);\n',
    );
    const binary = join(work, 'grow');
    const build = stator('build', entry, '-o', binary);
    assert.equal(build.status, 0, build.stderr);
    const run = spawn(binary, []);
    assert.notEqual(run.status, 0, 'growing a fixed layout must abort, never invent a slot');
    assert.match(run.stderr, /STA2004/);
    assert.equal(run.stdout, '', 'nothing may print before the abort');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

void test(
  'calling a non-function through an Unknown callee aborts with STA2006 at the site',
  NATIVE_ONLY,
  () => {
    const work = mkdtempSync(join(tmpdir(), 'stator-cli-'));
    try {
      const entry = join(work, 'call.js');
      writeFileSync(entry, 'function f(g) {\n  return g(1);\n}\nconsole.log(f(1));\n');
      const binary = join(work, 'call');
      const build = stator('build', entry, '-o', binary, '--mode=js');
      assert.equal(build.status, 0, build.stderr);
      const run = spawn(binary, []);
      assert.notEqual(run.status, 0, 'a non-function callee must abort, never jump');
      assert.match(run.stderr, /STA2006/);
      assert.match(run.stderr, /call\.js:2/);
      assert.equal(run.stdout, '', 'nothing may print before the abort');
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  },
);

void test(
  'a dynamic value reaching an annotated .ts binding aborts with STA2001',
  NATIVE_ONLY,
  () => {
    const work = mkdtempSync(join(tmpdir(), 'stator-cli-'));
    try {
      writeFileSync(join(work, 'wrap.js'), 'export function wrap(x) {\n  return x;\n}\n');
      const entry = join(work, 'main.ts');
      writeFileSync(
        entry,
        'import { wrap } from "./wrap.js";\nconst factor: number = wrap("10");\nconsole.log(factor);\n',
      );
      const binary = join(work, 'main');
      const build = stator('build', entry, '-o', binary, '--mode=js');
      assert.equal(build.status, 0, build.stderr);
      const run = spawn(binary, []);
      assert.notEqual(run.status, 0, 'a string in a number slot must abort, never print');
      assert.match(run.stderr, /STA2001/);
      assert.match(run.stderr, /main\.ts:2/);
      assert.equal(run.stdout, '', 'nothing may print before the abort');
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  },
);

/* Provenance has to survive the trip to stdout (plan.md §8 step 1). `lower.test.ts` proves the HIR
 * fact; this proves the report carries it, because a grade that is right in the HIR and lost on the
 * way out is still a wrong answer to the question the user asked.
 *
 * All three grades in one matrix, because each is defined against the other two: `typed` is a
 * signature its AUTHOR wrote whole, `inferred` is one the checker finished, and `dynamic` is one
 * holding an Unknown -- which outranks both, since an un-annotated js parameter is not an omission
 * the checker happened to solve, it is the request for a dynamic value. The js half is the half
 * worth pinning: JSDoc is an annotation by the same author in a second spelling, so a fully
 * documented `.js` function grades `typed`, and only the PARTLY documented one is `inferred`
 * (plan-notes 140). */
void test('explain --json grades every function typed, inferred or dynamic', () => {
  const work = mkdtempSync(join(tmpdir(), 'stator-provenance-'));
  try {
    // One statement per call: `console.log` takes one argument until plan §8 step 12 lands the rest.
    writeFileSync(
      join(work, 'grades.ts'),
      'function whole(x: number): number { return x; }\n' +
        'function halfWritten(x: number) { return x; }\n' +
        'console.log(whole(1));\n' +
        'console.log(halfWritten(2));\n',
    );
    writeFileSync(
      join(work, 'grades.js'),
      '/**\n * @param {number} x\n * @returns {number}\n */\n' +
        'function whole(x) { return x; }\n' +
        '/** @param {number} x */\n' +
        'function halfWritten(x) { return x; }\n' +
        'function none(x) { return x; }\n' +
        'console.log(whole(1));\n' +
        'console.log(halfWritten(2));\n' +
        'console.log(none(3));\n',
    );

    const ts = stator('explain', join(work, 'grades.ts'), '--json');
    assert.equal(ts.status, 0, ts.stderr);
    assert.deepEqual(JSON.parse(ts.stdout), {
      verdict: 'static',
      functions: [
        { name: 'whole', line: 1, provenance: 'typed', verdict: 'static' },
        // An inferred RETURN is enough to demote it: the question is what the author asserted, and
        // the shape of the declaration never enters into it.
        { name: 'halfWritten', line: 2, provenance: 'inferred', verdict: 'static' },
      ],
    });

    const js = stator('explain', join(work, 'grades.js'), '--mode=js', '--json');
    assert.equal(js.status, 0, js.stderr);
    assert.deepEqual(JSON.parse(js.stdout), {
      // The FILE is dynamic because `none` is; its two annotated neighbours still compile static,
      // which is the js-mode claim §8 step 6 calls the JSDoc freebie.
      verdict: 'dynamic',
      functions: [
        { name: 'whole', line: 5, provenance: 'typed', verdict: 'static' },
        { name: 'halfWritten', line: 7, provenance: 'inferred', verdict: 'static' },
        { name: 'none', line: 8, provenance: 'dynamic', verdict: 'dynamic' },
      ],
    });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

void test('a fully JSDoc-annotated .js module has file verdict static', () => {
  const work = mkdtempSync(join(tmpdir(), 'stator-jsdoc-'));
  try {
    const entry = join(work, 'freebie.js');
    writeFileSync(
      entry,
      '/**\n * @param {number} x\n * @returns {number}\n */\n' +
        'function double(x) {\n  return x * 2;\n}\n' +
        'console.log(double(21));\n',
    );
    const explained = stator('explain', entry, '--mode=js', '--json');
    assert.equal(explained.status, 0, explained.stderr);
    assert.deepEqual(JSON.parse(explained.stdout), {
      verdict: 'static',
      functions: [{ name: 'double', line: 5, provenance: 'typed', verdict: 'static' }],
    });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

void test("a .js entry under default ts mode is STA1002 with a --mode=js hint, not tsc's allowJs error", () => {
  const work = mkdtempSync(join(tmpdir(), 'stator-js-under-ts-'));
  try {
    const entry = join(work, 'entry.js');
    writeFileSync(entry, 'console.log(1);\n');

    const explained = stator('explain', entry, '--json');
    assert.equal(explained.status, 0, explained.stderr);
    assert.deepEqual(JSON.parse(explained.stdout), { verdict: 'error', code: 'STA1002' });

    // The hint has to come from the CLI path, not the in-memory host: tsc used to DROP the .js
    // file and answer STA0012 "enable the allowJs option", which is the wrong code and the wrong
    // flag. `build` reports programDiagnostics before the gate, so this is the path that used to
    // lose.
    const built = stator('build', entry, '-o', join(work, 'out'));
    assert.notEqual(built.status, 0);
    assert.match(built.stderr, /STA1002/);
    assert.match(built.stderr, /`--mode=js`/);
    assert.doesNotMatch(built.stderr, /STA0012/);
    assert.doesNotMatch(built.stderr, /allowJs/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
