/* Pinned-Node differential oracle (plan.md §9 Task 6.2). */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateProgram, type DifferentialMode } from './generate.ts';
import { minimizeProgram } from './minimize.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const CLI = join(REPO, 'src', 'cli', 'main.ts');
const FAILURE_DIR = join(HERE, 'failures');
const TIMEOUT_MS = 5000;

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

function run(command: string, args: readonly string[], cwd?: string): Streams {
  const result = spawnSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut: result.error?.code === 'ETIMEDOUT',
  };
}

function execute(source: string, mode: DifferentialMode): { readonly node: Streams; readonly stator: Streams } {
  const work = mkdtempSync(join(REPO, '.differential-'));
  const extension = mode === 'ts' ? '.ts' : '.js';
  const input = join(work, `case${extension}`);
  const output = join(work, 'app');
  try {
    writeFileSync(input, source, 'utf8');
    const build = run(process.execPath, [CLI, 'build', input, '-o', output, `--mode=${mode}`]);
    if (build.status !== 0 || build.timedOut) {
      return { node: run(process.execPath, [input]), stator: build };
    }
    return { node: run(process.execPath, [input]), stator: run(output, []) };
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

function finding(seed: number, mode: DifferentialMode, source: string): Finding | undefined {
  const initial = execute(source, mode);
  if (initial.stator.status !== 0 && !initial.stator.timedOut && !isInternalDiagnostic(initial.stator)) {
    throw new Error(`generator produced a rejected ${mode} program for seed ${String(seed)}: ${initial.stator.stderr.trim()}`);
  }
  if (sameResult(initial.node, initial.stator)) {
    return undefined;
  }
  const minimized = minimizeProgram(source, (candidate) => {
    const result = execute(candidate, mode);
    return (
      result.stator.status === 0 ||
      result.stator.timedOut ||
      isInternalDiagnostic(result.stator)
    ) && !sameResult(result.node, result.stator);
  });
  const final = execute(minimized, mode);
  return {
    seed,
    mode,
    source,
    minimized,
    node: final.node,
    stator: final.stator,
    firstDiff: firstDifference(final.node.stdout, final.stator.stdout),
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

function main(): void {
  const seed = numberArg('--seed', 1);
  const count = numberArg('--count', 1);
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
  process.stdout.write(`differential: seed=${String(seed)} modes=${modes.join(',')}\n`);
  let cases = 0;
  for (const mode of modes) {
    const deadline =
      budgetPerMode === 0 ? Number.POSITIVE_INFINITY : Date.now() + budgetPerMode;
    for (let offset = 0; offset < count || (minutes > 0 && Date.now() < deadline); offset += 1) {
      const currentSeed = seed + offset;
      const source = generateProgram(currentSeed, mode);
      const result = finding(currentSeed, mode, source);
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
  process.stdout.write(`differential: ${String(cases)} cases — 0 divergences\n`);
}

main();
