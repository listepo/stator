/* Math.random — the determinism carve-out's proof (plan.md §7 Task 4.2).
 *
 * Every other builtin is proved by a golden test: compile it, run it, diff stdout against the
 * pinned Node byte-for-byte. Math.random cannot be proved that way and never will be, because the
 * spec requires an implementation-chosen value — "matches Node" is not a property it HAS. That is
 * exactly why the plan carves it out, and this file is the other half of that carve-out: the
 * dashboard is allowed to stop counting it against coverage only because these assertions exist.
 *
 * So this tests the properties the spec DOES pin — the half-open range [0, 1), and that the
 * generator actually varies — rather than a value. A stub returning 0.5 forever satisfies the
 * range and fails the variation check; a stub returning 1.0 fails the range. Both are the
 * plausible ways to get this wrong.
 */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../../src/cli/main.ts', import.meta.url));
const SAMPLES = 2000;

/** Compile `source` in ts mode, run it, and hand back the lines it printed. */
function compileAndRun(source: string): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'stator-random-'));
  try {
    const entry = join(dir, 'main.ts');
    const out = join(dir, 'main');
    writeFileSync(entry, source);
    const build = spawnSync(process.execPath, [CLI, 'build', entry, '-o', out, '--mode=ts'], {
      encoding: 'utf8',
    });
    assert.equal(build.status, 0, `build failed:\n${build.stdout}${build.stderr}`);
    const run = spawnSync(out, [], { encoding: 'utf8' });
    assert.equal(run.status, 0, `run failed:\n${run.stdout}${run.stderr}`);
    return run.stdout.trimEnd().split('\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

void test('Math.random stays in [0, 1) and varies', () => {
  const lines = compileAndRun(
    `for (let i = 0; i < ${String(SAMPLES)}; i++) {\n  console.log(Math.random());\n}\n`,
  );
  assert.equal(lines.length, SAMPLES);

  const values = lines.map((line) => Number(line));
  for (const [index, value] of values.entries()) {
    assert.ok(Number.isFinite(value), `sample ${String(index)} is not finite: ${lines[index]}`);
    // Half-open: 0 is a legal result, 1 is not. The mantissa construction in jsrt_math_random is
    // what makes the upper bound structural rather than probabilistic, so an off-by-one there
    // shows up here rather than one run in 2^52.
    assert.ok(value >= 0, `sample ${String(index)} below 0: ${String(value)}`);
    assert.ok(value < 1, `sample ${String(index)} not below 1: ${String(value)}`);
  }

  // A constant generator passes every assertion above. These two are what catch it.
  assert.ok(new Set(values).size > SAMPLES / 2, 'Math.random repeats far too often');
  // Both halves of the interval must appear. With 2000 samples a correct generator misses one
  // half with probability 2^-1999, so this is deterministic in practice, not flaky.
  assert.ok(
    values.some((v) => v < 0.5) && values.some((v) => v >= 0.5),
    'Math.random never left one half of its range',
  );
});
