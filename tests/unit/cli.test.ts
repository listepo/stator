import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(REPO, 'src', 'cli', 'main.ts');

function stator(...args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
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
void test('a builtin the program never references is not in the binary (Task 3.12)', () => {
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
    assert.ok(binary.includes('jsrt_print'), 'the referenced builtin must survive the link');
    assert.ok(
      !binary.includes('jsrt_map_new'),
      'an unreferenced builtin must be dead-stripped, not dragged in with its object file',
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

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
    const result = spawnSync(process.execPath, [CLI, 'explain', 'entry.ts', '--json'], {
      cwd: work,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"verdict":"static"/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

// Task 4.1's honesty clause: structural aliasing can hand a FIXED-shape object to a dynamic
// property site — `b`'s annotation says shape table, `a`'s literal built a layout, and the checker
// blesses the assignment. Answering the read would require guessing a slot; the runtime aborts
// with the not-yet instead (golden rule 4: loudly unimplemented beats silently wrong).
void test('a fixed-shape object reaching a dynamic site aborts with STA2004, not a wrong answer', () => {
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
    const run = spawnSync(binary, [], { encoding: 'utf8' });
    assert.notEqual(run.status, 0, 'the aliased read must abort, never answer');
    assert.match(run.stderr, /STA2004/);
    assert.equal(run.stdout, '', 'nothing may print before the abort');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
