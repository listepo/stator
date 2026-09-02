/* Test262 conformance runner (plan.md §9 Task 6.1). */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { featureStatus } from './features.ts';

export interface Test262Frontmatter {
  readonly esid?: string;
  readonly features: readonly string[];
  readonly includes: readonly string[];
  readonly flags: readonly string[];
  readonly negative?: { readonly phase: string; readonly type: string };
  readonly locale?: readonly string[];
}

export interface Test262Result {
  readonly path: string;
  readonly verdict: 'passed' | 'failed' | 'skipped';
  readonly reason?: string;
  readonly features: readonly string[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const DEFAULT_CORPUS = join(HERE, 'corpus');
const CLI = join(REPO, 'src', 'cli', 'main.ts');
const RESULTS = join(HERE, 'results.json');
const PIN = join(HERE, 'pin.json');
const EXECUTION_KEYS = new Set(['esid', 'features', 'includes', 'flags', 'negative', 'locale']);
// Test262's standard header also carries descriptive information that does not affect how a test
// is built. It must be recognized rather than mistaken for a corpus-format change, while a new
// top-level key remains an error (plan.md §9 Task 6.1).
const DESCRIPTIVE_KEYS = new Set(['author', 'description', 'es5id', 'es6id', 'info']);
// `generated` says the file came out of the project's own tooling; INTERPRETING.md gives it no
// execution meaning at all, and it is on 17,003 of the corpus's 53,874 files. Treating it as an
// unimplemented flag skipped nearly a third of Test262 for a provenance note (plan-notes 176).
const ALLOWED_FLAGS = new Set(['raw', 'onlyStrict', 'noStrict', 'module', 'async', 'generated']);
const ASYNC_COMPLETE = 'Test262:AsyncTestComplete';
/** How many unexplained failures to print in full before falling back to the count alone. */
const UNEXPLAINED_SAMPLE = 20;
/** Wall-clock ceiling for one compile or one compiled program; a hang is a failure, not a wait. */
const PROCESS_TIMEOUT_MS = 30_000;
const DIAGNOSTIC_ERROR_CLASSES: Readonly<Record<string, readonly string[]>> = {
  STA0012: ['SyntaxError'],
  STA2001: ['TypeError'],
  STA2004: ['TypeError'],
  STA2005: ['RangeError', 'SyntaxError', 'TypeError'],
  STA2006: ['TypeError'],
};

function listValue(raw: string): string[] {
  const value = raw.trim();
  if (value === '' || value === '[]') {
    return [];
  }
  if (!value.startsWith('[') || !value.endsWith(']')) {
    throw new Error(`expected a bracketed list, got ${raw}`);
  }
  return value
    .slice(1, -1)
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter((item) => item !== '');
}

function scalar(raw: string): string {
  return raw.trim().replace(/^['"]|['"]$/g, '');
}

/** Parse the Test262 execution metadata; unknown top-level keys are corpus-format errors. */
export function parseFrontmatter(source: string, file = '<source>'): Test262Frontmatter {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === '/*---');
  if (start < 0) {
    throw new Error(`${file}: missing /*--- frontmatter`);
  }
  const end = lines.findIndex((line, index) => index > start && line.trim() === '---*/');
  if (end < 0) {
    throw new Error(`${file}: unterminated frontmatter`);
  }
  const features: string[] = [];
  const includes: string[] = [];
  const flags: string[] = [];
  let esid: string | undefined;
  let locale: string[] | undefined;
  let negative: { phase?: string; type?: string } | undefined;
  let pendingList: string[] | undefined;
  let blockScalarIndent: number | undefined;
  for (let i = start + 1; i < end; i += 1) {
    const line = lines[i] ?? '';
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (blockScalarIndent !== undefined && (line.trim() === '' || indent >= blockScalarIndent)) {
      continue;
    }
    blockScalarIndent = undefined;
    const listItem = /^\s*-\s*(.+)$/.exec(line);
    if (listItem !== null) {
      if (pendingList === undefined) throw new Error(`${file}: list item without a list key`);
      pendingList.push(scalar(listItem[1] ?? ''));
      continue;
    }
    const match = /^(\s*)([A-Za-z][\w-]*):(?:\s*(.*))?$/.exec(line);
    if (match === null) {
      if (line.trim() === '') continue;
      throw new Error(`${file}: invalid frontmatter line ${line}`);
    }
    const keyIndent = match[1]?.length ?? 0;
    const key = match[2] ?? '';
    const value = match[3] ?? '';
    // A handful of legacy Test262 files indent a descriptive top-level key by one space. The
    // field has no execution meaning, so recognize that historical formatting without treating
    // arbitrary nested metadata as a top-level key.
    const legacyDescriptiveKey = keyIndent === 1 && DESCRIPTIVE_KEYS.has(key);
    if (keyIndent > 0 && !legacyDescriptiveKey) {
      if (negative === undefined || (key !== 'phase' && key !== 'type') || keyIndent < 2) {
        throw new Error(`${file}: unknown nested frontmatter key "${key}"`);
      }
      negative[key] = scalar(value);
      continue;
    }
    pendingList = undefined;
    if (!EXECUTION_KEYS.has(key) && !DESCRIPTIVE_KEYS.has(key)) {
      throw new Error(`${file}: unknown frontmatter key "${key}"`);
    }
    if (/^[>|][+-]?$/.test(value.trim())) {
      blockScalarIndent = 1;
    }
    if (key === 'negative') {
      negative = {};
    } else if (key === 'features' || key === 'includes' || key === 'flags') {
      const target = key === 'features' ? features : key === 'includes' ? includes : flags;
      target.push(...listValue(value));
      if (value.trim() === '') pendingList = target;
    } else if (key === 'esid') {
      esid = scalar(value);
    } else if (key === 'locale') {
      locale =
        value.trim() === ''
          ? []
          : value.trim().startsWith('[')
            ? listValue(value)
            : [scalar(value)];
      if (value.trim() === '') pendingList = locale;
    }
  }
  const parsedNegative =
    negative === undefined ? undefined : { phase: negative.phase, type: negative.type };
  if (
    parsedNegative !== undefined &&
    (parsedNegative.phase === undefined || parsedNegative.type === undefined)
  ) {
    throw new Error(`${file}: negative requires phase and type`);
  }
  return parsedNegative === undefined
    ? {
        ...(esid === undefined ? {} : { esid }),
        features,
        includes,
        flags,
        ...(locale === undefined ? {} : { locale }),
      }
    : {
        ...(esid === undefined ? {} : { esid }),
        features,
        includes,
        flags,
        negative: { phase: parsedNegative.phase ?? '', type: parsedNegative.type ?? '' },
        ...(locale === undefined ? {} : { locale }),
      };
}

function corpusRoot(): string {
  const configured = process.env['STATOR_TEST262'];
  const root = configured ?? DEFAULT_CORPUS;
  return root;
}

function pinnedCommit(): string {
  const parsed: unknown = JSON.parse(readFileSync(PIN, 'utf8'));
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('commit' in parsed) ||
    typeof parsed.commit !== 'string'
  ) {
    throw new Error(`${PIN}: expected a commit SHA`);
  }
  return parsed.commit;
}

function testFiles(root: string): string[] {
  const result: string[] = [];
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, name.name);
      if (name.isDirectory()) visit(path);
      // `_FIXTURE` files are imported BY tests and "MUST NOT be interpreted as standalone tests"
      // (INTERPRETING.md). They carry no frontmatter, so enumerating them turned 294 non-tests into
      // reported skips — noise in the one number this task exists to publish.
      else if (name.isFile() && name.name.endsWith('.js') && !name.name.endsWith('_FIXTURE.js'))
        result.push(path);
    }
  };
  visit(join(root, 'test'));
  return result.sort((left, right) => left.localeCompare(right));
}

function diagnosticCode(stderr: string): string | undefined {
  return /\b(STA\d{4})\b/.exec(stderr)?.[1];
}

/** The lowest not-yet code in a build that raised NOTHING but not-yet codes.
 *
 * `STA12xx` is schedule, not conformance (plan.md §1.3: the never and not-yet ranges are disjoint
 * so a test can tell intent from schedule), so a test the compiler declines to build yet is a skip
 * attributed to that code — exactly what step 4 already does for a negative test. A build that also
 * raised any other code refused the program for a reason of its own and stays a failure. */
export function scheduleSkipCode(stderr: string): string | undefined {
  const codes = [...stderr.matchAll(/\b(STA\d{4})\b/g)].map((match) => match[1] ?? '');
  if (codes.length === 0 || codes.some((code) => !code.startsWith('STA12'))) return undefined;
  return [...codes].sort()[0];
}

function errorClassMatches(stderr: string, type: string): boolean {
  const code = diagnosticCode(stderr);
  const mapped = code === undefined ? undefined : DIAGNOSTIC_ERROR_CLASSES[code];
  if (mapped !== undefined) return mapped.includes(type);
  return (
    code === undefined &&
    new RegExp(`\\b${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(stderr)
  );
}

function harnessSource(root: string, path: string, metadata: Test262Frontmatter): string {
  const body = readFileSync(path, 'utf8');
  if (metadata.flags.includes('raw')) return body;
  // The corpus supplies its own assertion library AND its own `sta.js` (`Test262Error`,
  // `$DONOTEVALUATE`); Stator supplies only the host's `$DONE`.
  const files = [
    join(root, 'harness', 'assert.js'),
    join(root, 'harness', 'sta.js'),
    join(HERE, 'harness', 'done.js'),
    ...metadata.includes.map((name) => join(root, 'harness', name)),
  ];
  const missing = files.find((file) => !existsSync(file));
  if (missing !== undefined) throw new Error(`missing harness file ${missing}`);
  const strict = metadata.flags.includes('onlyStrict') ? `'use strict';\n` : '';
  return `${strict}${files.map((file) => readFileSync(file, 'utf8')).join('\n')}\n${body}`;
}

interface ProcessResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Async `spawnSync`, so the pool in `main` can keep every core busy.
 *
 * A serial corpus pass is roughly five hours on this hardware, which is not a per-commit CI job
 * (step 8) — and a conformance heartbeat nobody can afford to run is the same as not having one. */
function runProcess(command: string, args: readonly string[]): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], { timeout: PROCESS_TIMEOUT_MS });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    // `error` fires without `close` when the spawn itself failed, and WITH it when the timeout
    // killed a running child. Settling on `close` whenever the child exists keeps the temp-file
    // cleanup in `execute` from racing a process that is still reading its input.
    let settled = false;
    const settle = (status: number | null): void => {
      if (settled) return;
      settled = true;
      resolve({ status, stdout, stderr });
    };
    child.on('error', (error: Error) => {
      stderr += `\n${error.message}`;
      if (child.pid === undefined) settle(null);
    });
    child.on('close', (code) => {
      settle(code);
    });
  });
}

async function execute(
  path: string,
  root: string,
  metadata: Test262Frontmatter,
  slot: number,
): Promise<Test262Result> {
  const rel = relative(root, path);
  const unsupportedFlag = metadata.flags.find((flag) => !ALLOWED_FLAGS.has(flag));
  if (unsupportedFlag !== undefined)
    return {
      path: rel,
      verdict: 'skipped',
      reason: `flag ${unsupportedFlag}`,
      features: metadata.features,
    };
  const unsupported = metadata.features
    .map((feature) => [feature, featureStatus(feature)] as const)
    .find(([, status]) => status === undefined || status.kind !== 'supported');
  if (unsupported !== undefined) {
    const [feature, status] = unsupported;
    if (status === undefined) throw new Error(`unmapped feature ${feature}`);
    return {
      path: rel,
      verdict: 'skipped',
      reason: status.kind === 'not-yet' ? `${status.code} (${feature})` : `never (${feature})`,
      features: metadata.features,
    };
  }
  const work = join(HERE, '.tmp');
  mkdirSync(work, { recursive: true });
  // Keyed by the pool slot as well as the pid: two workers sharing one filename would compile each
  // other's source and report the answer to the wrong test.
  const input = join(work, `test-${process.pid}-${String(slot)}.js`);
  const output = join(work, `test-${process.pid}-${String(slot)}.out`);
  writeFileSync(input, harnessSource(root, path, metadata), 'utf8');
  const build = await runProcess(process.execPath, [
    CLI,
    'build',
    input,
    '-o',
    output,
    '--mode=js',
  ]);
  try {
    if (metadata.negative?.phase === 'parse' || metadata.negative?.phase === 'resolution') {
      if (build.status === 0)
        return {
          path: rel,
          verdict: 'failed',
          reason: 'negative test compiled successfully',
          features: metadata.features,
        };
      const code = diagnosticCode(build.stderr);
      if (code?.startsWith('STA12') === true)
        return { path: rel, verdict: 'skipped', reason: code, features: metadata.features };
      return {
        path: rel,
        verdict: errorClassMatches(build.stderr, metadata.negative.type) ? 'passed' : 'failed',
        reason: code ?? build.stderr.trim(),
        features: metadata.features,
      };
    }
    if (build.status !== 0) {
      const pending = scheduleSkipCode(build.stderr);
      return pending === undefined
        ? { path: rel, verdict: 'failed', reason: build.stderr.trim(), features: metadata.features }
        : { path: rel, verdict: 'skipped', reason: pending, features: metadata.features };
    }
    const execution = await runProcess(output, []);
    if (metadata.negative?.phase === 'runtime') {
      return {
        path: rel,
        verdict:
          execution.status !== 0 && errorClassMatches(execution.stderr, metadata.negative.type)
            ? 'passed'
            : 'failed',
        reason: execution.stderr.trim(),
        features: metadata.features,
      };
    }
    if (metadata.flags.includes('async') && !execution.stdout.includes(ASYNC_COMPLETE)) {
      return {
        path: rel,
        verdict: 'failed',
        reason: `async test did not call $DONE (missing ${ASYNC_COMPLETE})`,
        features: metadata.features,
      };
    }
    return {
      path: rel,
      verdict: execution.status === 0 ? 'passed' : 'failed',
      reason: execution.stderr.trim(),
      features: metadata.features,
    };
  } finally {
    for (const file of [input, output]) {
      try {
        rmSync(file, { force: true });
      } catch {
        /* best-effort temp cleanup */
      }
    }
  }
}

function expectedFailures(): Map<string, string> {
  const path = join(HERE, 'expected-fail.txt');
  const entries = new Map<string, string>();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([^#\s]+)\s*#\s*(.+?)\s*$/.exec(line);
    if (match !== null) entries.set(match[1] ?? '', match[2] ?? '');
  }
  return entries;
}

function ratchetCheck(passed: number, failed: number): string[] {
  const parsed: unknown = JSON.parse(readFileSync(join(HERE, 'ratchet.json'), 'utf8'));
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('passed' in parsed) ||
    !('failed' in parsed) ||
    !('skipped' in parsed) ||
    typeof parsed.passed !== 'number' ||
    typeof parsed.failed !== 'number' ||
    typeof parsed.skipped !== 'number'
  ) {
    throw new Error('ratchet.json must contain numeric passed, failed, and skipped fields');
  }
  const failures: string[] = [];
  if (passed < parsed.passed)
    failures.push(`ratchet: passed dropped from ${String(parsed.passed)} to ${String(passed)}`);
  if (failed > parsed.failed)
    failures.push(`ratchet: failed rose from ${String(parsed.failed)} to ${String(failed)}`);
  return failures;
}

async function one(path: string, root: string, slot: number): Promise<Test262Result> {
  try {
    const metadata = parseFrontmatter(readFileSync(path, 'utf8'), path);
    return await execute(path, root, metadata, slot);
  } catch (error) {
    if (error instanceof Error && error.message.endsWith('missing /*--- frontmatter'))
      return {
        path: relative(root, path),
        verdict: 'skipped',
        reason: 'missing frontmatter',
        features: [],
      };
    return {
      path: relative(root, path),
      verdict: 'failed',
      reason: error instanceof Error ? error.message : String(error),
      features: [],
    };
  }
}

async function main(): Promise<void> {
  const root = corpusRoot();
  if (!existsSync(join(root, 'test'))) {
    process.stdout.write('test262: corpus missing — fetch with `pnpm run test262:fetch`\n');
    writeFileSync(
      RESULTS,
      `${JSON.stringify({ corpus: null, commit: pinnedCommit(), passed: 0, failed: 0, skipped: 0, results: [] }, null, 2)}\n`,
      'utf8',
    );
    process.stdout.write(
      'test262: 0 passed, 0 skipped (corpus missing), 0 failed — pass rate 0.0%\n',
    );
    return;
  }
  // Fixed-size pool: each slot pulls the next test, so a slow compile never idles the others. The
  // results array is indexed by test, not by completion order, keeping results.json deterministic.
  const paths = testFiles(root);
  const results: Test262Result[] = new Array<Test262Result>(paths.length);
  let next = 0;
  const width = Math.max(1, Math.min(availableParallelism(), paths.length));
  await Promise.all(
    Array.from({ length: width }, async (_unused, slot) => {
      for (;;) {
        const index = next;
        next += 1;
        const path = paths[index];
        if (path === undefined) return;
        results[index] = await one(path, root, slot);
      }
    }),
  );
  const passed = results.filter((result) => result.verdict === 'passed').length;
  const failed = results.filter((result) => result.verdict === 'failed').length;
  const skipped = results.filter((result) => result.verdict === 'skipped').length;
  writeFileSync(
    RESULTS,
    `${JSON.stringify({ corpus: root, commit: pinnedCommit(), passed, failed, skipped, results }, null, 2)}\n`,
    'utf8',
  );
  const skipCounts = new Map<string, number>();
  for (const result of results.filter((item) => item.verdict === 'skipped')) {
    const feature = /\(([^()]+)\)$/.exec(result.reason ?? '')?.[1];
    const category = feature ?? result.reason ?? 'unattributed skip';
    skipCounts.set(category, (skipCounts.get(category) ?? 0) + 1);
  }
  const details = [...skipCounts.entries()]
    .sort()
    .map(([feature, count]) => `${feature}: ${String(count)}`)
    .join(', ');
  const rate = passed + failed === 0 ? 0 : (passed / (passed + failed)) * 100;
  process.stdout.write(
    `test262: ${String(passed)} passed, ${String(skipped)} skipped${details === '' ? '' : ` (${details})`}, ${String(failed)} failed — pass rate ${rate.toFixed(1)}%\n`,
  );
  const known = expectedFailures();
  const failures = results.filter((result) => result.verdict === 'failed');
  const unexplained = failures.filter((result) => !known.has(result.path));
  // Unexplained failures are REPORTED but do not by themselves fail the run: at this corpus size a
  // per-test expectation file cannot be the gate without becoming a five-thousand-line artifact
  // nobody reads, and an unreadable list explains nothing. The ratchet below is the gate — it is
  // what "monotonically tracked" means (plan.md §9 Task 6.1 step 7) — and this sample plus its
  // total is what keeps the failures visible rather than aggregate-only.
  for (const result of unexplained.slice(0, UNEXPLAINED_SAMPLE))
    process.stderr.write(`FAIL ${result.path}: ${(result.reason ?? '').split('\n')[0] ?? ''}\n`);
  if (unexplained.length > 0)
    process.stderr.write(
      `test262: ${String(unexplained.length)} failure(s) not in expected-fail.txt${unexplained.length > UNEXPLAINED_SAMPLE ? ` (showing ${String(UNEXPLAINED_SAMPLE)})` : ''}\n`,
    );
  const staleExpected = [...known.keys()].filter(
    (path) => results.find((result) => result.path === path)?.verdict !== 'failed',
  );
  for (const path of known.keys()) {
    const result = results.find((item) => item.path === path);
    if (result?.verdict === 'passed')
      process.stderr.write(`FAIL ${path}: unexpected PASS; remove it from expected-fail.txt\n`);
  }
  for (const path of staleExpected) {
    const result = results.find((item) => item.path === path);
    if (result === undefined)
      process.stderr.write(`FAIL ${path}: expected failure is absent from the pinned corpus\n`);
    else if (result.verdict !== 'passed')
      process.stderr.write(
        `FAIL ${path}: expected failure is now ${result.verdict}; update expected-fail.txt\n`,
      );
  }
  const ratchetFailures = ratchetCheck(passed, failed);
  for (const failure of ratchetFailures) process.stderr.write(`FAIL ${failure}\n`);
  if (
    staleExpected.length > 0 ||
    ratchetFailures.length > 0 ||
    [...known.keys()].some(
      (path) => results.find((item) => item.path === path)?.verdict === 'passed',
    )
  )
    process.exitCode = 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
