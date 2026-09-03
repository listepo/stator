/* Weekly benchmark recorder (plan.md §9 Task 6.3). Extends the Phase 2 baseline shape. */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { arch, cpus, hostname, platform, release, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const CLI = join(REPO, 'src', 'cli', 'main.ts');
const PROGRAMS = join(HERE, 'programs');
const RESULTS = join(HERE, 'results');
const RUNS = 5;

interface Streams {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly maxRssRaw: number;
  readonly maxRssBytes: number;
}

interface ProgramMeasurement {
  readonly program: string;
  readonly startupMsBest: number;
  readonly runtimeMsBest: number;
  readonly peakRssBytes: number;
  readonly peakRssRaw: number;
  readonly binaryBytes: number;
  readonly output: string;
}

interface EngineResult {
  readonly engine: string;
  readonly version: string;
  readonly measurements: readonly ProgramMeasurement[];
}

function hostId(): string {
  return `${platform()}-${arch()}-${hostname()}`.replace(/[^A-Za-z0-9_.-]/g, '_');
}

function run(command: string, args: readonly string[], timeout = 120_000): Streams {
  const time = '/usr/bin/time';
  const timedArgs =
    platform() === 'darwin' ? ['-l', command, ...args] : ['-f', '%M', command, ...args];
  const result = existsSync(time)
    ? spawnSync(time, timedArgs, { encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024 })
    : spawnSync(command, [...args], { encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024 });
  const stderr = result.stderr ?? '';
  const rawMatch =
    platform() === 'darwin'
      ? /maximum resident set size:\s*(\d+)/.exec(stderr)
      : /(?:^|\n)(\d+)\s*$/.exec(stderr);
  const raw = rawMatch === null ? 0 : Number(rawMatch[1]);
  const cleanedStderr =
    rawMatch === null
      ? stderr
      : platform() === 'darwin'
        ? stderr
            .split('\n')
            .filter(
              (line) =>
                !/^\s*(?:\d+(?:\.\d+)?\s+(?:real|user|sys)|\d+\s+[a-z].*|[a-z].*\d+)\s*$/.test(
                  line,
                ),
            )
            .join('\n')
            .trim()
        : stderr.slice(0, rawMatch.index).trimEnd();
  const maxRssBytes = platform() === 'darwin' ? raw : raw * 1024;
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: cleanedStderr,
    maxRssRaw: raw,
    maxRssBytes,
  };
}

function clangVersion(): string {
  const cc = process.env['CC'] ?? 'clang';
  return execFileSync(cc, ['--version'], { encoding: 'utf8' }).split('\n')[0] ?? 'unknown';
}

function measureStator(program: string, expected: string): ProgramMeasurement {
  const source = join(PROGRAMS, program);
  const work = mkdtempSync(join(tmpdir(), `stator-bench-${process.pid}-`));
  const output = join(work, 'app');
  let compileBest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < RUNS; i += 1) {
    const started = process.hrtime.bigint();
    const result = run(process.execPath, [CLI, 'build', source, '-o', output]);
    compileBest = Math.min(compileBest, Number(process.hrtime.bigint() - started) / 1e6);
    if (result.status !== 0)
      throw new Error(`stator build failed for ${program}: ${result.stderr.trim()}`);
  }
  let runtimeBest = Number.POSITIVE_INFINITY;
  let peak = 0;
  let raw = 0;
  for (let i = 0; i < RUNS; i += 1) {
    const started = process.hrtime.bigint();
    const result = run(output, []);
    runtimeBest = Math.min(runtimeBest, Number(process.hrtime.bigint() - started) / 1e6);
    peak = Math.max(peak, result.maxRssBytes);
    raw = Math.max(raw, result.maxRssRaw);
    if (result.status !== 0 || result.stdout !== expected)
      throw new Error(`stator result mismatch for ${program}`);
  }
  const measurement = {
    program,
    startupMsBest: compileBest,
    runtimeMsBest: runtimeBest,
    peakRssBytes: peak,
    peakRssRaw: raw,
    binaryBytes: statSync(output).size,
    output: expected,
  };
  rmSync(work, { recursive: true, force: true });
  return measurement;
}

function probe(name: string): { readonly path: string; readonly version: string } | undefined {
  try {
    const path = execFileSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).trim();
    if (path === '') return undefined;
    const version = run(path, ['--version'], 10_000).stdout.split('\n')[0] ?? 'unknown';
    return { path, version };
  } catch {
    return undefined;
  }
}

function measureEngine(
  name: string,
  path: string,
  version: string,
  programs: readonly string[],
  expected: ReadonlyMap<string, string>,
): EngineResult {
  const measurements: ProgramMeasurement[] = [];
  for (const program of programs) {
    const source = join(PROGRAMS, program);
    const want = expected.get(program) ?? '';
    let best = Number.POSITIVE_INFINITY;
    let peak = 0;
    let raw = 0;
    for (let i = 0; i < RUNS; i += 1) {
      const started = process.hrtime.bigint();
      const result = run(path, [source]);
      best = Math.min(best, Number(process.hrtime.bigint() - started) / 1e6);
      peak = Math.max(peak, result.maxRssBytes);
      raw = Math.max(raw, result.maxRssRaw);
      if (result.status !== 0 || result.stdout !== want)
        throw new Error(`${name} result mismatch for ${program}`);
    }
    measurements.push({
      program,
      startupMsBest: best,
      runtimeMsBest: best,
      peakRssBytes: peak,
      peakRssRaw: raw,
      binaryBytes: 0,
      output: want,
    });
  }
  return { engine: name, version, measurements };
}

function sameHostPrevious(): { readonly path: string; readonly stator: EngineResult } | undefined {
  if (!existsSync(RESULTS)) return undefined;
  const files = readdirSync(RESULTS)
    .filter((file) => file.endsWith(`-${hostId()}.json`))
    .sort();
  const file = files.at(-1);
  if (file === undefined) return undefined;
  const parsed: unknown = JSON.parse(readFileSync(join(RESULTS, file), 'utf8'));
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('engines' in parsed) ||
    !Array.isArray(parsed.engines)
  )
    return undefined;
  const stator = parsed.engines.find(
    (engine): engine is EngineResult =>
      typeof engine === 'object' &&
      engine !== null &&
      'engine' in engine &&
      engine.engine === 'stator',
  );
  return stator === undefined ? undefined : { path: join(RESULTS, file), stator };
}

function geomean(measurements: readonly ProgramMeasurement[]): number {
  const values = measurements
    .map((measurement) => measurement.runtimeMsBest)
    .filter((value) => value > 0);
  return values.length === 0
    ? 0
    : Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

function main(): void {
  const programs = readdirSync(PROGRAMS)
    .filter((file) => file.endsWith('.ts'))
    .sort();
  const expected = new Map<string, string>();
  for (const program of programs) {
    const result = run(process.execPath, [join(PROGRAMS, program)]);
    if (result.status !== 0)
      throw new Error(`Node benchmark oracle failed for ${program}: ${result.stderr.trim()}`);
    expected.set(program, result.stdout);
  }
  const stator: EngineResult = {
    engine: 'stator',
    version: 'working tree',
    measurements: programs.map((program) => measureStator(program, expected.get(program) ?? '')),
  };
  const engines: EngineResult[] = [stator];
  for (const name of ['node', 'bun', 'qjs', 'perry', 'scriptc', 'hermes']) {
    const found = probe(name);
    engines.push(
      found === undefined
        ? { engine: name, version: 'absent', measurements: [] }
        : measureEngine(name, found.path, found.version, programs, expected),
    );
  }
  const stamp = new Date().toISOString();
  const result = {
    recordedAt: stamp,
    host: {
      id: hostId(),
      platform: platform(),
      release: release(),
      arch: arch(),
      cpu: cpus()[0]?.model ?? 'unknown',
    },
    toolchain: { node: process.version, clang: clangVersion(), generatedCFlags: '-std=c11 -O2' },
    runsPerProgram: RUNS,
    programs,
    engines,
    regression: { thresholdPercent: 20, statorGeomeanMs: geomean(stator.measurements) },
  };
  const previous = sameHostPrevious();
  if (previous !== undefined) {
    const old = geomean(previous.stator.measurements);
    const current = geomean(stator.measurements);
    const regression = old === 0 ? 0 : ((current - old) / old) * 100;
    if (regression > result.regression.thresholdPercent)
      throw new Error(
        `benchmark regression ${regression.toFixed(1)}% exceeds ${String(result.regression.thresholdPercent)}%`,
      );
  }
  mkdirSync(RESULTS, { recursive: true });
  // Full timestamp, not `stamp.slice(0, 10)`: two recordings on the same day wrote the same file,
  // so the second SILENTLY REPLACED the first and the regression gate lost the run it should have
  // compared against. Step 5's clause is "appended, never overwritten"; the date alone cannot be.
  const path = join(RESULTS, `${stamp.replace(/[:.]/g, '-')}-${hostId()}.json`);
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  const oldBaseline: unknown = JSON.parse(readFileSync(join(HERE, 'baseline.json'), 'utf8'));
  writeFileSync(
    join(HERE, 'baseline.json'),
    `${JSON.stringify({ ...(typeof oldBaseline === 'object' && oldBaseline !== null ? oldBaseline : {}), recordedAt: stamp, programs, engines, regression: result.regression }, null, 2)}\n`,
    'utf8',
  );
  const lines = [
    '# Stator benchmark page',
    '',
    `Generated: ${stamp}`,
    '',
    '| Engine | Version | Geomean runtime (ms) |',
    '|---|---|---:|',
  ];
  for (const engine of engines)
    lines.push(
      `| ${engine.engine} | ${engine.version} | ${engine.measurements.length === 0 ? '—' : geomean(engine.measurements).toFixed(2)} |`,
    );
  writeFileSync(join(HERE, 'README.md'), `${lines.join('\n')}\n`, 'utf8');
  process.stdout.write(`bench: recorded ${String(programs.length)} programs to ${path}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
