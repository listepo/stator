/* Records the Phase 2 baseline into tests/bench/baseline.json (plan.md §5 Task 2.7).
 *
 * These numbers exist to be compared against LATER numbers from the same machine. They are not
 * comparable to anything published about another compiler, and the file records toolchain and host
 * details precisely so a future reader can tell whether a regression is real or is just a
 * different machine (AGENTS.md: never quote a benchmark you did not measure here).
 *
 *   pnpm run bench:record
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const CLI = join(REPO, 'src', 'cli', 'main.ts');
const GOLDEN = join(REPO, 'tests', 'golden', 'ts');

/** Wall-time is noisy at this scale, so take the best of a few runs: the minimum is the one number
 * a scheduling hiccup cannot inflate. Averaging would fold the hiccups back in. */
const RUNS = 5;

interface Measurement {
  readonly fixture: string;
  readonly compileMsBest: number;
  readonly binaryBytes: number;
}

function measure(fixture: string): Measurement {
  const src = join(GOLDEN, fixture);
  const work = mkdtempSync(join(tmpdir(), 'stator-bench-'));
  try {
    const out = join(work, 'app');
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < RUNS; i += 1) {
      const started = process.hrtime.bigint();
      const result = spawnSync(process.execPath, [CLI, 'build', src, '-o', out], {
        encoding: 'utf8',
      });
      const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
      if (result.status !== 0) {
        throw new Error(`stator build failed for ${fixture}: ${result.stderr.trim()}`);
      }
      best = Math.min(best, elapsed);
    }
    return {
      fixture,
      compileMsBest: Math.round(best),
      binaryBytes: statSync(out).size,
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function clangVersion(): string {
  const cc = process.env['CC'] ?? 'clang';
  const first = execFileSync(cc, ['--version'], { encoding: 'utf8' }).split('\n')[0];
  return first ?? 'unknown';
}

function main(): void {
  const fixtures = readdirSync(GOLDEN)
    .filter((n) => n.endsWith('.ts'))
    .sort();
  const measurements = fixtures.map(measure);

  const baseline = {
    // Stamped by the caller's clock rather than hard-coded, but recorded so a stale baseline is
    // visible rather than silently authoritative.
    recordedAt: new Date().toISOString(),
    host: {
      platform: platform(),
      release: release(),
      arch: arch(),
      cpu: cpus()[0]?.model ?? 'unknown',
    },
    toolchain: {
      node: process.version,
      clang: clangVersion(),
      // -O2 is what src/cli/build.ts passes; a baseline taken at another level is a different
      // baseline, not a better one.
      generatedCFlags: '-std=c11 -O2',
    },
    runsPerFixture: RUNS,
    note: 'compileMsBest is the minimum of runsPerFixture wall-clock measurements of `stator build`, including Node startup and the clang invocation.',
    measurements,
  };

  const path = join(HERE, 'baseline.json');
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  process.stdout.write(`bench: recorded ${String(measurements.length)} fixtures to ${path}\n`);
  for (const m of measurements) {
    process.stdout.write(
      `  ${m.fixture}: ${String(m.compileMsBest)} ms, ${String(m.binaryBytes)} bytes\n`,
    );
  }
}

main();
