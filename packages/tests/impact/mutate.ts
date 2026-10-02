/* Mutation check for the test-impact selector (plan.md §9 Task 6.17 Check (a), plan-notes 293).
 *
 * Usage: node packages/tests/impact/mutate.ts [--map=<path>] [--seed=N] [--count=20] [--native=3]
 *
 * Soundness is "every test the change can fail is selected". This checks it the only way that
 * means anything: break the code, run the WHOLE of each harness, and assert every failing test is
 * in the selection the selector computed for that broken tree. Each seeded mutation is one of
 *
 * - a compiler function the map saw executed: `throw new Error('mut')` as its first statement;
 * - an exported runtime C function: `__builtin_abort()` as its first statement (`abort()` with no
 *   `<stdlib.h>` to add, so no line moves), with the runtime rebuilt around it.
 *
 * Both insert on the body's opening line, so no other line number moves. The harnesses run are
 * unit, subset and golden (and the runtime corpus for C mutations) — the ones a compiler or
 * runtime change reaches; ASan, leak and FFI rerun those programs under other flags. The map must
 * have been recorded at `HEAD` on a clean tree, so the diff is the mutation and nothing else.
 */
import { readFileSync, mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import {
  decodeBits,
  type HarnessName,
  type HarnessSelection,
  type ImpactMap,
  type Span,
} from '../support/impact.ts';
import { readShardFile, runProcess } from '../support/parallel.ts';
import {
  DEFAULT_MAP,
  REPO,
  RUNNERS,
  VITEST,
  VITEST_CONFIG,
  computeSelection,
  currentTests,
  git,
  justCommand,
  readMap,
} from './shared.ts';

type Checked = 'unit' | 'subset' | 'golden' | 'runtime';

interface Mutation {
  readonly kind: 'compiler' | 'runtime';
  readonly path: string;
  readonly line: number;
  readonly label: string;
  /** Character offset just after the body's `{`, where the statement goes. */
  readonly at: number;
  readonly insert: string;
}

interface Options {
  readonly map: string;
  readonly seed: number;
  readonly count: number;
  readonly native: number;
}

function parseArgs(argv: readonly string[]): Options {
  let map = DEFAULT_MAP;
  let seed = 6017;
  let count = 20;
  let native = 3;
  for (const arg of argv) {
    const [flag, value = ''] = arg.split('=', 2);
    const number = Number.parseInt(value, 10);
    if (flag === '--map') map = resolve(value);
    else if (flag === '--seed' && Number.isFinite(number)) seed = number;
    else if (flag === '--count' && Number.isFinite(number)) count = number;
    else if (flag === '--native' && Number.isFinite(number)) native = number;
    else throw new Error(`unknown flag "${arg}"`);
  }
  return { map, seed, count, native };
}

/** mulberry32: a seeded generator, so a reported mutation set can be replayed exactly. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let at = out.length - 1; at > 0; at -= 1) {
    const other = Math.floor(random() * (at + 1));
    const a = out[at];
    const b = out[other];
    if (a === undefined || b === undefined) continue;
    out[at] = b;
    out[other] = a;
  }
  return out;
}

/* ---------------------------------------------------------------------------------------- */
/* Picking mutations                                                                        */
/* ---------------------------------------------------------------------------------------- */

interface Candidate {
  readonly path: string;
  readonly span: Span;
  /** How many recorded tests (unit + subset + golden) executed it. */
  readonly tests: number;
  readonly total: number;
}

function executedSpans(map: ImpactMap): Candidate[] {
  const counts = new Map<string, { path: string; span: Span; tests: number }>();
  let total = 0;
  for (const harness of ['unit', 'subset', 'golden'] as const) {
    const record = map.harnesses[harness];
    if (record === undefined) continue;
    total += Object.keys(record.tests).length;
    for (const test of Object.values(record.tests)) {
      for (const [path, bits] of Object.entries(test.fns)) {
        if (!path.startsWith('packages/compiler/src/')) continue;
        const fns = record.files[path]?.fns ?? [];
        for (const index of decodeBits(bits)) {
          const span = fns[index];
          if (span === undefined) continue;
          const key = `${path}:${String(span[0])}:${String(span[1])}`;
          const entry = counts.get(key) ?? { path, span, tests: 0 };
          entry.tests += 1;
          counts.set(key, entry);
        }
      }
    }
  }
  return [...counts.values()].map((entry) => ({ ...entry, total }));
}

/** The innermost function with a block body whose V8 span is `span`. */
function locateFunction(path: string, text: string, span: Span): Mutation | undefined {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const lineOf = (offset: number): number => file.getLineAndCharacterOfPosition(offset).line + 1;
  let best: { node: ts.FunctionLikeDeclaration; body: ts.Block } | undefined;
  const visit = (node: ts.Node): void => {
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isConstructorDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node)) &&
      node.body !== undefined &&
      ts.isBlock(node.body)
    ) {
      const body = node.body;
      const start = lineOf(node.getStart(file));
      const open = lineOf(body.getStart(file));
      if (lineOf(body.getEnd() - 1) === span[1] && start <= span[0] && span[0] <= open) {
        if (best === undefined || node.getWidth(file) < best.node.getWidth(file)) {
          best = { node, body };
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (best === undefined) return undefined;
  const { node, body } = best;
  const name = node.name !== undefined && ts.isIdentifier(node.name) ? node.name.text : '<anon>';
  return {
    kind: 'compiler',
    path,
    line: lineOf(body.getStart(file)),
    label: `${path}:${String(span[0])} ${name}`,
    at: body.getStart(file) + 1,
    insert: " throw new Error('mut');",
  };
}

function pickCompiler(map: ImpactMap, count: number, random: () => number): Mutation[] {
  const candidates = shuffle(executedSpans(map), random);
  // Two thirds narrow (run by at most a quarter of the tests), so the check exercises the rules
  // that skip tests rather than the hot paths that select everything anyway.
  const narrow = candidates.filter((entry) => entry.tests <= entry.total / 4);
  const wanted = [
    ...narrow.slice(0, Math.ceil((count * 2) / 3)),
    ...candidates.filter((entry) => !narrow.includes(entry)),
  ];
  const out: Mutation[] = [];
  const files = new Set<string>();
  for (const entry of [...wanted, ...narrow.slice(Math.ceil((count * 2) / 3))]) {
    if (out.length >= count) break;
    if (files.has(entry.path)) continue; // one per file: spread over the compiler
    const text = readFileSync(join(REPO, entry.path), 'utf8');
    const mutation = locateFunction(entry.path, text, entry.span);
    if (mutation === undefined) continue;
    files.add(entry.path);
    out.push(mutation);
  }
  return out;
}

const C_DEFINITION = /^(?!static\b)[A-Za-z_][\w \t*]*?\b(jsrt_\w+)\s*\([^;{}]*\)\s*\{\s*$/;

function pickRuntime(count: number, random: () => number): Mutation[] {
  const files = ['jsrt_date.c', 'jsrt_string.c', 'jsrt_regexp.c'];
  const rest = shuffle(
    readdirSync(join(REPO, 'packages', 'runtime', 'src')).filter(
      (name) => name.endsWith('.c') && !files.includes(name),
    ),
    random,
  );
  const out: Mutation[] = [];
  for (const name of [...files, ...rest]) {
    if (out.length >= count) break;
    const path = `packages/runtime/src/${name}`;
    const text = readFileSync(join(REPO, path), 'utf8');
    const lines = text.split('\n');
    const defs = lines.flatMap((line, at) => {
      const match = C_DEFINITION.exec(line);
      return match?.[1] === undefined ? [] : [{ at, name: match[1] }];
    });
    const def = shuffle(defs, random)[0];
    if (def === undefined) continue;
    const offset = lines.slice(0, def.at + 1).join('\n').length;
    out.push({
      kind: 'runtime',
      path,
      line: def.at + 1,
      label: `${path}:${String(def.at + 1)} ${def.name}`,
      at: offset,
      insert: ' __builtin_abort();',
    });
  }
  return out;
}

/* ---------------------------------------------------------------------------------------- */
/* Running every test                                                                       */
/* ---------------------------------------------------------------------------------------- */

const TIMEOUT_MS = 15 * 60 * 1000;
const EVERYTHING = '*';

/** Failing unit files (repo paths); `*` when vitest died before reporting. */
async function failingUnit(tmp: string): Promise<Set<string>> {
  const out = join(tmp, 'unit.json');
  rmSync(out, { force: true });
  await runProcess(
    VITEST,
    ['run', '--config', VITEST_CONFIG, '--reporter=json', `--outputFile=${out}`],
    { timeoutMs: TIMEOUT_MS },
  );
  if (!existsSync(out)) return new Set([EVERYTHING]);
  const parsed: unknown = JSON.parse(readFileSync(out, 'utf8'));
  const failing = new Set<string>();
  if (typeof parsed !== 'object' || parsed === null || !('testResults' in parsed)) {
    return new Set([EVERYTHING]);
  }
  const results: unknown = parsed.testResults;
  if (!Array.isArray(results)) return new Set([EVERYTHING]);
  for (const result of results as unknown[]) {
    if (typeof result !== 'object' || result === null) continue;
    if (!('name' in result) || !('status' in result) || typeof result.name !== 'string') continue;
    if (result.status !== 'passed') {
      failing.add(result.name.startsWith(REPO) ? result.name.slice(REPO.length + 1) : result.name);
    }
  }
  return failing;
}

/** Failing fixture keys of an in-process runner, every one of its N slices at once. */
async function failingSharded(
  harness: 'subset' | 'golden',
  tmp: string,
  jobs: number,
): Promise<Set<string>> {
  const runs = await Promise.all(
    Array.from({ length: jobs }, async (_unused, slot) => {
      const out = join(tmp, `${harness}-${String(slot + 1)}.json`);
      rmSync(out, { force: true });
      const result = await runProcess(
        process.execPath,
        [
          join(REPO, RUNNERS[harness]),
          `--shard=${String(slot + 1)}/${String(jobs)}`,
          `--json-out=${out}`,
        ],
        { timeoutMs: TIMEOUT_MS },
      );
      return { out, ok: result.status === 0 && existsSync(out) };
    }),
  );
  const failing = new Set<string>();
  for (const run of runs) {
    // A worker that died took its whole slice with it; the slice is not known here, so the
    // failure is "everything" — sound only if the selection ran the whole harness.
    if (!run.ok) return new Set([EVERYTHING]);
    for (const record of readShardFile(run.out)) {
      const value = record.value;
      const passed =
        value === null ||
        (typeof value === 'object' &&
          'kind' in value &&
          (value.kind === 'passed' || value.kind === 'expected-fail'));
      if (!passed) failing.add(record.key);
    }
  }
  return failing;
}

async function failingRuntime(): Promise<Set<string>> {
  const command = justCommand('runtime-test');
  const result = await runProcess(command.command, command.args, { timeoutMs: TIMEOUT_MS });
  return result.status === 0 ? new Set() : new Set(['runtime']);
}

async function buildRuntime(): Promise<boolean> {
  const command = justCommand('runtime');
  const result = await runProcess(command.command, command.args, { timeoutMs: TIMEOUT_MS });
  if (result.status !== 0) process.stderr.write(result.stderr);
  return result.status === 0;
}

/* ---------------------------------------------------------------------------------------- */

interface Outcome {
  readonly mutation: Mutation;
  readonly selected: Readonly<Record<Checked, number>>;
  readonly failed: Readonly<Record<Checked, number>>;
  readonly missed: readonly string[];
  readonly seconds: number;
}

function covers(selection: HarnessSelection | undefined, failing: ReadonlySet<string>): string[] {
  if (selection === undefined) return [...failing];
  if (selection.all) return [];
  const keys = new Set(selection.keys);
  return [...failing].filter((key) => key === EVERYTHING || !keys.has(key));
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  process.chdir(REPO);
  const head = git(['rev-parse', 'HEAD']).trim();
  const map = readMap(options.map);
  if (map.commit !== head || map.dirty) {
    throw new Error(`the map must be recorded at HEAD (${head.slice(0, 12)}) on a clean tree`);
  }
  if (git(['status', '--porcelain', '--untracked-files=no']).trim() !== '') {
    throw new Error('the tree must be clean: the diff has to be the mutation and nothing else');
  }
  const random = rng(options.seed);
  const mutations = [
    ...pickCompiler(map, options.count, random),
    ...pickRuntime(options.native, random),
  ];
  const jobs = availableParallelism();
  const tmp = mkdtempSync(join(tmpdir(), 'stator-mutate-'));
  const outcomes: Outcome[] = [];
  const started = Date.now();
  const totals = currentTests();
  try {
    for (const mutation of mutations) {
      const t0 = Date.now();
      const file = join(REPO, mutation.path);
      const original = readFileSync(file, 'utf8');
      writeFileSync(
        file,
        `${original.slice(0, mutation.at)}${mutation.insert}${original.slice(mutation.at)}`,
      );
      try {
        if (mutation.kind === 'runtime' && !(await buildRuntime())) {
          throw new Error(`${mutation.label}: the mutated runtime does not build`);
        }
        const { selection } = computeSelection(options.map);
        const pick = (harness: HarnessName): HarnessSelection | undefined =>
          selection.harnesses.find((entry) => entry.harness === harness);
        const failing: Record<Checked, Set<string>> = {
          unit: await failingUnit(tmp),
          subset: await failingSharded('subset', tmp, jobs),
          golden: await failingSharded('golden', tmp, jobs),
          runtime: mutation.kind === 'runtime' ? await failingRuntime() : new Set(),
        };
        const checked: readonly Checked[] = ['unit', 'subset', 'golden', 'runtime'];
        const missed = checked.flatMap((harness) =>
          covers(pick(harness), failing[harness]).map((key) => `${harness}: ${key}`),
        );
        const count = (harness: Checked): number => {
          const entry = pick(harness);
          return entry === undefined ? 0 : entry.keys.length;
        };
        outcomes.push({
          mutation,
          selected: {
            unit: count('unit'),
            subset: count('subset'),
            golden: count('golden'),
            runtime: count('runtime'),
          },
          failed: {
            unit: failing.unit.size,
            subset: failing.subset.size,
            golden: failing.golden.size,
            runtime: failing.runtime.size,
          },
          missed,
          seconds: (Date.now() - t0) / 1000,
        });
        const last = outcomes.at(-1);
        if (last !== undefined) process.stdout.write(`${row(last)}\n`);
      } finally {
        writeFileSync(file, original);
        if (mutation.kind === 'runtime') await buildRuntime();
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  const missed = outcomes.filter((outcome) => outcome.missed.length > 0);
  const killed = outcomes.filter((outcome) =>
    Object.values(outcome.failed).some((count) => count > 0),
  );
  process.stdout.write(
    `\nmutate: ${String(outcomes.length)} mutations (seed ${String(options.seed)}), ` +
      `${String(killed.length)} broke at least one test, ${String(missed.length)} unsound, ` +
      `${((Date.now() - started) / 1000).toFixed(0)} s` +
      ` (suite: unit ${String(totals.unit.length)} files, subset ${String(totals.subset.length)}, golden ${String(totals.golden.length)})\n`,
  );
  for (const outcome of missed) {
    process.stdout.write(`UNSOUND ${outcome.mutation.label}\n  ${outcome.missed.join('\n  ')}\n`);
  }
  return missed.length === 0 ? 0 : 1;
}

function row(outcome: Outcome): string {
  const cell = (harness: Checked): string =>
    `${harness} ${String(outcome.failed[harness])}/${String(outcome.selected[harness])}`;
  const verdict = outcome.missed.length === 0 ? 'ok  ' : 'MISS';
  return `${verdict} ${outcome.mutation.label.padEnd(64)} failed/selected: ${(['unit', 'subset', 'golden', 'runtime'] as const).map(cell).join('  ')}  ${outcome.seconds.toFixed(0)} s`;
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`mutate: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
