/* Golden-test runner (plan.md §5 Task 2.6).
 *
 * Ground truth is the pinned Node in .node-version — that Node and only that Node.
 * Each fixture under tests/golden/ts|js is (a) compiled by stator and executed, and
 * (b) executed directly by Node. stdout must match BYTE-FOR-BYTE, number formatting
 * included (Ryu shortest-round-trip). A mismatch is a semantics bug: never loosen the
 * comparison to make it pass.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const CLI = join(REPO, 'src', 'cli', 'main.ts');

function fixtures(mode: 'ts' | 'js'): { mode: 'ts' | 'js'; path: string; name: string }[] {
  const dir = join(HERE, mode);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith(`.${mode}`))
    .sort()
    .map((name) => ({ mode, name, path: join(dir, name) }));
}

function runCompiled(path: string, mode: 'ts' | 'js'): string {
  const work = mkdtempSync(join(tmpdir(), 'stator-golden-'));
  try {
    const out = join(work, 'app');
    const build = spawnSync(process.execPath, [CLI, 'build', path, '-o', out, `--mode=${mode}`], {
      encoding: 'utf8',
    });
    if (build.status !== 0) {
      throw new Error(`stator build failed: ${build.stderr.trim()}`);
    }
    const exec = spawnSync(out, [], { encoding: 'utf8' });
    if (exec.status !== 0) {
      throw new Error(`compiled binary exited ${String(exec.status)}: ${exec.stderr.trim()}`);
    }
    return exec.stdout;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function runNode(path: string): string {
  const result = spawnSync(process.execPath, [path], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`node exited ${String(result.status)}: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function main(): void {
  const all = [...fixtures('ts'), ...fixtures('js')];
  let passed = 0;
  const failures: string[] = [];

  for (const fixture of all) {
    try {
      const actual = runCompiled(fixture.path, fixture.mode);
      const expected = runNode(fixture.path);
      if (actual === expected) {
        passed += 1;
      } else {
        failures.push(
          `${fixture.mode}/${fixture.name}: stdout differs\n  stator: ${JSON.stringify(actual)}\n  node:   ${JSON.stringify(expected)}`,
        );
      }
    } catch (error) {
      failures.push(
        `${fixture.mode}/${fixture.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  for (const failure of failures) {
    process.stderr.write(`FAIL ${failure}\n`);
  }
  process.stdout.write(
    `golden: ${String(all.length)} fixtures — ${String(passed)} passed, ${String(failures.length)} failed\n`,
  );
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main();
