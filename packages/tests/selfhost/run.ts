/* Self-compilation ratchet (plan.md §9 Task 6.19, plan-notes 306).
 *
 * Usage: node packages/tests/selfhost/run.ts [--update]
 *
 * Runs `stator explain --json` over every target in `targets.json`, from the target package's own
 * directory so its `stator.config.json` supplies the mode (and the compiler's entry): the command
 * a user would run. Each report's verdict and per-code diagnostic counts are compared against
 * `baseline.json` (see ratchet.ts for the rules). A target whose verdict is `static` or `dynamic`
 * then builds and runs its smoke check. `--update` rewrites the baseline, so a shrink is recorded
 * in the same change; whether growth may be recorded is open (plan-notes 306).
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Fail, makeFail } from '../support/c-runner.ts';
import { runProcess } from '../support/parallel.ts';
import {
  type Baseline,
  checkCoverage,
  compare,
  formatBaseline,
  packageDirs,
  parseBaseline,
  parseTargetList,
  type Smoke,
  type TargetResult,
  tally,
} from './ratchet.ts';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const HERE = fileURLToPath(new URL('.', import.meta.url));
const CLI = join(REPO, 'packages', 'compiler', 'src', 'cli', 'main.ts');
const BASELINE = join(HERE, 'baseline.json');
// Annotated: a `never` call narrows only through an explicitly typed binding.
const fail: Fail = makeFail('selfhost');

interface Job {
  readonly name: string;
  readonly cwd: string;
  /** Empty: the package's config names the entry. */
  readonly entry: readonly string[];
  readonly smoke: Smoke;
}

function readJson(path: string): unknown {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return parsed;
}

function jobs(): Job[] {
  const list = parseTargetList(readJson(join(HERE, 'targets.json')));
  const problems = checkCoverage(list, packageDirs(REPO));
  if (problems.length > 0) fail(problems.join('\n'));
  const out: Job[] = [];
  for (const target of list.targets) {
    const cwd = join(REPO, target.package);
    if (target.entries === undefined) {
      out.push({ name: target.package, cwd, entry: [], smoke: target.smoke });
      continue;
    }
    const dir = target.entries;
    for (const file of readdirSync(join(cwd, dir))
      .filter((name) => name.endsWith('.ts'))
      .sort()) {
      const entry = `${dir}/${file}`;
      out.push({ name: `${target.package}/${entry}`, cwd, entry: [entry], smoke: target.smoke });
    }
  }
  return out;
}

async function explain(job: Job): Promise<TargetResult> {
  const result = await runProcess(process.execPath, [CLI, 'explain', ...job.entry, '--json'], {
    cwd: job.cwd,
  });
  let report: unknown;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    fail(`${job.name}: explain printed no JSON (exit ${String(result.status)}):\n${result.stderr}`);
  }
  return tally(report);
}

/** Build every module of a `std-goldens` target and run it; then the `std_*` goldens. */
async function smokeStd(built: readonly Job[]): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), 'stator-selfhost-'));
  try {
    for (const job of built) {
      const out = join(work, basename(job.name, '.ts'));
      const build = await runProcess(process.execPath, [CLI, 'build', ...job.entry, '-o', out], {
        cwd: job.cwd,
      });
      if (build.status !== 0) fail(`${job.name}: build failed:\n${build.stdout}${build.stderr}`);
      const exec = await runProcess(out, []);
      if (exec.status !== 0) {
        fail(`${job.name}: binary exited ${String(exec.status)}:\n${exec.stderr}`);
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const goldens = await runProcess(process.execPath, [
    join(REPO, 'packages', 'tests', 'golden', 'run.ts'),
    '--filter',
    'std_',
  ]);
  if (goldens.status !== 0) fail(`std goldens failed:\n${goldens.stdout}${goldens.stderr}`);
  process.stdout.write(
    `selfhost: std smoke — ${String(built.length)} modules built and run; ${goldens.stdout.split('\n')[0] ?? ''}\n`,
  );
}

function describe(result: TargetResult): string {
  const codes = Object.entries(result.codes).map(([code, count]) => `${String(count)} × ${code}`);
  return `${result.verdict}${codes.length > 0 ? `, ${codes.join(', ')}` : ''}`;
}

async function main(): Promise<void> {
  const update = process.argv.includes('--update');
  const started = performance.now();
  const all = jobs();
  const results = await Promise.all(all.map(explain));
  const explained = performance.now();
  const measured: Record<string, TargetResult> = {};
  all.forEach((job, index) => {
    const result = results[index];
    if (result === undefined) fail(`${job.name}: no result`);
    measured[job.name] = result;
    process.stdout.write(`selfhost: ${job.name}: ${describe(result)}\n`);
  });

  const baseline: Baseline = update ? {} : parseBaseline(readJson(BASELINE));
  if (update) {
    writeFileSync(BASELINE, formatBaseline(measured));
    process.stdout.write(`selfhost: baseline rewritten (${String(all.length)} targets)\n`);
  } else {
    const { regressions, improvements } = compare(baseline, measured);
    if (regressions.length > 0 || improvements.length > 0) {
      fail(
        [
          ...regressions.map((line) => `regression: ${line}`),
          ...improvements.map((line) => `shrunk, record it with --update: ${line}`),
        ].join('\n'),
      );
    }
  }

  const passing = all.filter((job) => {
    const verdict = measured[job.name]?.verdict;
    return verdict === 'static' || verdict === 'dynamic';
  });
  const std = passing.filter((job) => job.smoke === 'std-goldens');
  if (std.length > 0) await smokeStd(std);
  for (const job of passing.filter((each) => each.smoke === 'stage2')) {
    fail(
      `${job.name} reached ${measured[job.name]?.verdict ?? '?'}: its stage-2 check ` +
        '(byte-identical C from the self-compiled compiler) is not written yet — ' +
        'plan.md §9 Task 6.19 point 2',
    );
  }
  const secondsSince = (from: number): string => ((performance.now() - from) / 1000).toFixed(1);
  process.stdout.write(
    `selfhost: ${String(all.length)} targets match the baseline ` +
      `(${secondsSince(started)} s: explain ${((explained - started) / 1000).toFixed(1)} s, ` +
      `smoke ${secondsSince(explained)} s)\n`,
  );
}

await main();
