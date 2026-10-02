/* plan.md §11c T11.5: the `--node` platform edge (docs/MODES.md §6).
 *
 * `packages/node` has no module yet (T11.6 lands the first), so these tests point
 * `STATOR_NODE_ROOT` at a stub package and prove the edge itself: a landed built-in resolves under
 * both spellings and compiles like any other module, an unlanded member of a landed module names
 * T11.6, a member Node does not have stays the checker's error, the flag comes from the config
 * file as well as the command line, and nothing resolves without it. The decision tests cover the
 * unlanded modules and the four `require` cells against the real (empty) package. */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, test } from 'vitest';
import { NATIVE_ONLY } from './helpers.ts';

const CLI = fileURLToPath(new URL('../../compiler/src/cli/main.ts', import.meta.url));

/** A stub `packages/node` whose `node:os` exports one member of the real module's surface. */
const STUB_OS = 'export function platform(): string {\n  return "stub";\n}\n';

let work = '';
let stubRoot = '';

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'stator-node-'));
  stubRoot = join(work, 'node');
  mkdirSync(join(stubRoot, 'src'), { recursive: true });
  writeFileSync(join(stubRoot, 'src', 'os.ts'), STUB_OS);
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

interface Verdict {
  verdict: string;
  code?: string;
  diagnostics?: { code: string; message: string }[];
}

/** `stator explain --json` over `source`, in a fresh directory that may hold a config file. */
function explain(source: string, args: readonly string[], config?: object): Verdict {
  const dir = mkdtempSync(join(work, 'case-'));
  writeFileSync(join(dir, 'main.ts'), source);
  if (config !== undefined) {
    writeFileSync(join(dir, 'stator.config.json'), JSON.stringify(config));
  }
  const run = spawnSync(process.execPath, [CLI, 'explain', 'main.ts', '--json', ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, STATOR_NODE_ROOT: stubRoot },
  });
  assert.equal(run.status, 0, run.stderr);
  const parsed: unknown = JSON.parse(run.stdout);
  assert.ok(typeof parsed === 'object' && parsed !== null && 'verdict' in parsed);
  return parsed as Verdict;
}

const USES_PLATFORM = (spec: string): string =>
  `import { platform } from "${spec}";\nconsole.log(platform());\n`;

test('a landed built-in resolves to packages/node under both spellings', () => {
  assert.equal(explain(USES_PLATFORM('node:os'), ['--node']).verdict, 'static');
  assert.equal(explain(USES_PLATFORM('os'), ['--node']).verdict, 'static');
});

test('the config key turns the platform on like the flag', () => {
  assert.equal(explain(USES_PLATFORM('node:os'), [], { node: true }).verdict, 'static');
});

test('without --node a built-in names the flag, landed or not', () => {
  const got = explain(USES_PLATFORM('node:os'), []);
  assert.equal(got.verdict, 'not-yet');
  assert.equal(got.code, 'STA1214');
  assert.match(got.diagnostics?.[0]?.message ?? '', /'node:os' is a Node built-in; .*--node/);
});

test("a member the stub lacks but Node's module has names T11.6", () => {
  const got = explain('import { hostname } from "node:os";\nconsole.log(hostname());\n', [
    '--node',
  ]);
  assert.equal(got.verdict, 'not-yet');
  assert.equal(got.code, 'STA1214');
  assert.match(got.diagnostics?.[0]?.message ?? '', /'hostname' from 'node:os' .*T11\.6/);
});

test('a member Node does not have stays the checker error', () => {
  const got = explain('import { nothing } from "node:os";\nconsole.log(nothing);\n', ['--node']);
  assert.equal(got.verdict, 'error');
  assert.equal(got.code, 'STA0012');
});

test('a built-in under --node builds and runs through packages/node', NATIVE_ONLY, () => {
  const dir = mkdtempSync(join(work, 'build-'));
  const entry = join(dir, 'main.ts');
  const out = join(dir, 'main');
  writeFileSync(entry, USES_PLATFORM('os'));
  const env = { ...process.env, STATOR_NODE_ROOT: stubRoot };
  const build = spawnSync(process.execPath, [CLI, 'build', entry, '-o', out, '--node'], {
    encoding: 'utf8',
    env,
  });
  assert.equal(build.status, 0, `build failed:\n${build.stdout}${build.stderr}`);
  const ran = spawnSync(out, [], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(ran.status, 0, ran.stderr);
  assert.equal(ran.stdout, 'stub\n');
});
