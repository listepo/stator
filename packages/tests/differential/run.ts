/* Pinned-Node differential oracle (plan.md §9 Task 6.2).
 *
 * A divergence is recorded only if the minimized program still diverges on re-execution, confirmed
 * by a second run when a timeout is involved: timeouts count as divergences for the run itself, but
 * a transient timeout under load is not a finding (plan.md §9 Task 6.10).
 *
 * `--smoke` (or `--smoke=N`) is a fast local preset of the same run: N generated programs per mode
 * (default 5) with a short per-program timeout, fully offline (every spawn is local: the compiler
 * host, the pinned Node, clang, the emitted binary — this harness never touches the network). It
 * reuses the exact generate → compile → Node-diff → minimize path below; only the case count and
 * the per-spawn timeout differ, and both are printed in the smoke banner and summary so a smoke
 * run can never pose as a full one. Cannot be combined with `--count`/`--minutes`. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateProgram, type DifferentialMode } from './generate.ts';
import { minimizeProgram } from './minimize.ts';
import { nodePath } from '../support/node-path.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const CLI = join(REPO, 'compiler', 'src', 'cli', 'main.ts');
const FAILURE_DIR = join(HERE, 'failures');
const TIMEOUT_MS = 5000;
// Smoke preset: short enough for local iteration, long enough for a real type-check + clang
// build of a tiny generated program (a colder machine still completes; a transient timeout is
// dropped by the re-check guard in `finding`, never recorded).
const SMOKE_DEFAULT_COUNT = 5;
const SMOKE_TIMEOUT_MS = 2000;

interface Streams {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

interface Finding {
  readonly seed: number;
  readonly mode: DifferentialMode;
  readonly source: string;
  readonly minimized: string;
  readonly node: Streams;
  readonly stator: Streams;
  readonly firstDiff: number;
}

function run(command: string, args: readonly string[], cwd?: string, timeoutMs: number = TIMEOUT_MS): Streams {
  const result = spawnSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    // `error` is typed `Error`, which has no `code`: narrow through `in` rather than casting.
    timedOut:
      result.error instanceof Error && 'code' in result.error && result.error.code === 'ETIMEDOUT',
  };
}

function execute(
  source: string,
  mode: DifferentialMode,
  timeoutMs: number,
): { readonly node: Streams; readonly stator: Streams } {
  const work = mkdtempSync(join(REPO, '.differential-'));
  const extension = mode === 'ts' ? '.ts' : '.js';
  const input = join(work, `case${extension}`);
  const output = join(work, 'app');
  try {
    writeFileSync(input, source, 'utf8');
    const build = run(process.execPath, [CLI, 'build', input, '-o', output, `--mode=${mode}`], undefined, timeoutMs);
    if (build.status !== 0 || build.timedOut) {
      // The oracle side: ground truth comes from `nodePath()`, while the build above stays on
      // the compiler host (`process.execPath`).
      return { node: run(nodePath(), [input], undefined, timeoutMs), stator: build };
    }
    return { node: run(nodePath(), [input], undefined, timeoutMs), stator: run(output, [], undefined, timeoutMs) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function firstDifference(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  for (let i = 0; i < limit; i += 1) {
    if (left.charCodeAt(i) !== right.charCodeAt(i)) {
      return i;
    }
  }
  return limit;
}

function sameResult(left: Streams, right: Streams): boolean {
  return left.status === right.status && left.stdout === right.stdout && left.stderr === right.stderr && !left.timedOut && !right.timedOut;
}

function isInternalDiagnostic(streams: Streams): boolean {
  return /STA4\d{3}/.test(streams.stderr);
}

function finding(seed: number, mode: DifferentialMode, source: string, timeoutMs: number): Finding | undefined {
  const initial = execute(source, mode, timeoutMs);
  if (initial.stator.status !== 0 && !initial.stator.timedOut && !isInternalDiagnostic(initial.stator)) {
    throw new Error(`generator produced a rejected ${mode} program for seed ${String(seed)}: ${initial.stator.stderr.trim()}`);
  }
  if (sameResult(initial.node, initial.stator)) {
    return undefined;
  }
  const minimized = minimizeProgram(source, (candidate) => {
    const result = execute(candidate, mode, timeoutMs);
    return (
      result.stator.status === 0 ||
      result.stator.timedOut ||
      isInternalDiagnostic(result.stator)
    ) && !sameResult(result.node, result.stator);
  });
  const final = execute(minimized, mode, timeoutMs);
  // Never record a divergence the harness cannot reproduce. The final run above is the re-check:
  // a transient timeout on the way here (initial build, minimization candidate) reads as agreement
  // here, not as a finding. Timeouts stay divergences for the run itself — a hang in emitted code
  // is a bug — so only the recorded finding needs this guard.
  if (sameResult(final.node, final.stator)) {
    return undefined;
  }
  let evidence = final;
  if (final.node.timedOut || final.stator.timedOut) {
    // A timeout finding reproduces only if it times out again: re-run once and drop the transient.
    // The recorded evidence is the confirming run, not the single timed-out one.
    const confirm = execute(minimized, mode, timeoutMs);
    if (sameResult(confirm.node, confirm.stator)) {
      return undefined;
    }
    evidence = confirm;
  }
  return {
    seed,
    mode,
    source,
    minimized,
    node: evidence.node,
    stator: evidence.stator,
    firstDiff: firstDifference(evidence.node.stdout, evidence.stator.stdout),
  };
}

function saveFinding(result: Finding): string {
  mkdirSync(FAILURE_DIR, { recursive: true });
  const base = `${result.mode}-${String(result.seed)}`;
  writeFileSync(join(FAILURE_DIR, `${base}.source`), result.source, 'utf8');
  writeFileSync(join(FAILURE_DIR, `${base}.min.js`), result.minimized, 'utf8');
  writeFileSync(join(FAILURE_DIR, `${base}.node.json`), `${JSON.stringify(result.node, null, 2)}\n`, 'utf8');
  writeFileSync(join(FAILURE_DIR, `${base}.stator.json`), `${JSON.stringify(result.stator, null, 2)}\n`, 'utf8');
  return join(FAILURE_DIR, `${base}.min.js`);
}

function numberArg(name: string, fallback: number): number {
  const raw = process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name}= must be a non-negative safe integer`);
  }
  return value;
}

/** `--smoke` (default count) or `--smoke=N`; undefined when absent. Zero is rejected: a run of
 * zero cases printing "0 divergences" is the dishonest clean sheet §9 warns about. */
function smokeCount(): number | undefined {
  if (process.argv.includes('--smoke')) {
    return SMOKE_DEFAULT_COUNT;
  }
  const raw = process.argv.find((arg) => arg.startsWith('--smoke='))?.slice('--smoke='.length);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('--smoke=N must be a positive safe integer');
  }
  return value;
}

function main(): void {
  const smoke = smokeCount();
  const seed = numberArg('--seed', 1);
  if (smoke !== undefined) {
    const clash = process.argv.find((arg) => arg.startsWith('--count=') || arg.startsWith('--minutes='));
    if (clash !== undefined) {
      throw new Error(`--smoke cannot be combined with ${clash}: smoke sets the case count and timeout itself`);
    }
  }
  const count = smoke ?? numberArg('--count', 1);
  const minutes = numberArg('--minutes', 0);
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='))?.slice('--mode='.length) ?? 'both';
  if (modeArg !== 'both' && modeArg !== 'ts' && modeArg !== 'js') throw new Error('--mode must be both, ts, or js');
  const modes: readonly DifferentialMode[] = modeArg === 'both' ? ['ts', 'js'] : [modeArg];
  // The time budget is split EVENLY across modes rather than shared. A single shared deadline let
  // the first mode spend the whole hour, after which the second ran `count` cases -- one, by
  // default -- and still printed "0 divergences". A fuzzing arm that tried one program and reported
  // a clean sheet is the dishonest version §9 warns about, and it is the `js` arm (step 8) that
  // would have been the one to disappear.
  const budgetPerMode = minutes === 0 ? 0 : (minutes * 60_000) / modes.length;
  const timeoutMs = smoke === undefined ? TIMEOUT_MS : SMOKE_TIMEOUT_MS;
  if (smoke === undefined) {
    process.stdout.write(`differential: seed=${String(seed)} modes=${modes.join(',')}\n`);
  } else {
    process.stdout.write(
      `differential smoke: seed=${String(seed)} modes=${modes.join(',')} count=${String(count)}/mode timeout=${String(timeoutMs)}ms offline\n`,
    );
  }
  let cases = 0;
  for (const mode of modes) {
    const deadline =
      budgetPerMode === 0 ? Number.POSITIVE_INFINITY : Date.now() + budgetPerMode;
    for (let offset = 0; offset < count || (minutes > 0 && Date.now() < deadline); offset += 1) {
      const currentSeed = seed + offset;
      const source = generateProgram(currentSeed, mode);
      const result = finding(currentSeed, mode, source, timeoutMs);
      cases += 1;
      if (result !== undefined) {
        const path = saveFinding(result);
        process.stderr.write(`DIVERGENCE seed=${String(result.seed)} mode=${result.mode} first-diff=${String(result.firstDiff)}\n`);
        process.stderr.write(`  minimized: ${path}\n`);
        process.stderr.write(`  node: ${JSON.stringify(result.node.stdout)}\n`);
        process.stderr.write(`  stator: ${JSON.stringify(result.stator.stdout)}\n`);
        process.exitCode = 1;
        return;
      }
      if (Date.now() >= deadline) {
        break;
      }
    }
  }
  if (smoke === undefined) {
    process.stdout.write(`differential: ${String(cases)} cases — 0 divergences\n`);
  } else {
    process.stdout.write(
      `differential smoke: ${String(cases)} cases (seed=${String(seed)} modes=${modes.join(',')} count=${String(count)}/mode timeout=${String(timeoutMs)}ms) — 0 divergences\n`,
    );
  }
}

main();
