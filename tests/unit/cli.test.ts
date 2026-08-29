import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
