/* The recording half of test impact (plan.md §9 Task 6.17, plan-notes 293).
 *
 * Loaded by `preload.ts` through `--import` (directly for the in-process runners, through
 * `NODE_OPTIONS` for every process a per-process harness starts), and inert unless
 * `STATOR_IMPACT_RECORD=<dir>` is set. It records three things V8 coverage alone cannot:
 *
 * - **reads:** repo files a test opens as data through `node:fs` (`done.md`, a fixture listing,
 *   `docs/DIAGNOSTICS.md`) — a change there selects the tests that read it;
 * - **native:** the runtime sources a test's binaries linked, resolved with `nm` the moment a
 *   `-ljsrt` link returns (before any caller deletes the binary);
 * - **in-process coverage** (`STATOR_IMPACT_INPROC=1`): a precise-coverage session started
 *   before the runner loads, taken once after loading and once per test, serially.
 *
 * Per-process harnesses write `impact-<pid>-*.txt` lines as they go (`R path` / `N path`), so a
 * worker the test runner kills still leaves its record; their coverage is `NODE_V8_COVERAGE`'s.
 */
import type * as FsModule from 'node:fs';
import { Session } from 'node:inspector/promises';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Span } from '../support/impact.ts';
import { CoverageConverter } from './coverage.ts';
import { NativeResolver, runtimeLink } from './native.ts';

/* Not `node:crypto`: loading it from the preload adds `defaultCipherList` to `node:constants`, and
 * `test:node-coverage` counts those members — the recorder must not change what a test observes. */
function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof FsModule;
const fsPromises: object = fs.promises;
const childProcess: object = require('node:child_process') as object;

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RECORD_DIR = process.env['STATOR_IMPACT_RECORD'];

// The recorder's own file access goes through these, captured before any patch.
const readText = fs.readFileSync.bind(fs);
const appendText = fs.appendFileSync.bind(fs);
const writeText = fs.writeFileSync.bind(fs);
const makeDir = fs.mkdirSync.bind(fs);

const IGNORED = ['node_modules/', '.git/', '.cache/', 'coverage/', 'packages/runtime/build'];

/** Repo-relative path of a `node:fs` path argument, when it names a repo file worth recording. */
function repoPathOf(arg: unknown): string | undefined {
  let abs: string;
  if (typeof arg === 'string') abs = resolve(arg);
  else if (arg instanceof URL && arg.protocol === 'file:') abs = fileURLToPath(arg);
  else return undefined;
  const rel = relative(REPO, abs).split(sep).join('/');
  if (rel === '' || rel.startsWith('..') || IGNORED.some((prefix) => rel.includes(prefix))) {
    return undefined;
  }
  return rel;
}

interface Sink {
  read(path: string): void;
  native(paths: readonly string[]): void;
}

let sink: Sink | undefined;
let suspended = 0;

function quietly<T>(work: () => T): T {
  suspended += 1;
  try {
    return work();
  } finally {
    suspended -= 1;
  }
}

const nativeResolver = new NativeResolver(REPO, undefined, (path) => readText(path, 'utf8'));

function noteRead(arg: unknown, listing: boolean): void {
  if (sink === undefined || suspended > 0) return;
  const path = repoPathOf(arg);
  if (path !== undefined) sink.read(listing ? `${path}/` : path);
}

function noteLink(argv: readonly unknown[], done: boolean): void {
  if (sink === undefined || suspended > 0) return;
  const args = argv.filter((arg): arg is string => typeof arg === 'string');
  const link = runtimeLink(args);
  if (link === undefined) return;
  if (link === '*' || !done) {
    sink.native(['*']);
    return;
  }
  const { out, libDir } = link;
  sink.native(quietly(() => nativeResolver.linked(out, libDir)));
}

/** Replace `target[key]` with a wrapper that observes calls; symbol-keyed properties (e.g.
 * `util.promisify.custom` on `execFile`) are carried over so promisified forms keep behaving. */
function wrap(
  target: object,
  key: string,
  observe: (args: readonly unknown[], result: unknown) => void,
  when: 'before' | 'after' = 'after',
): void {
  const original: unknown = Reflect.get(target, key);
  if (typeof original !== 'function') return;
  const wrapper = function (this: unknown, ...args: unknown[]): unknown {
    if (when === 'before') observe(args, undefined);
    const result: unknown = Reflect.apply(original, this, args);
    if (when === 'after') observe(args, result);
    return result;
  };
  for (const symbol of Object.getOwnPropertySymbols(original)) {
    const descriptor = Object.getOwnPropertyDescriptor(original, symbol);
    if (descriptor !== undefined) Object.defineProperty(wrapper, symbol, descriptor);
  }
  Reflect.set(target, key, wrapper);
}

function argvOf(args: readonly unknown[]): unknown[] {
  const [command, rest] = args;
  return [command, ...(Array.isArray(rest) ? (rest as unknown[]) : [])];
}

function onExit(child: unknown, argv: readonly unknown[]): void {
  if (typeof child !== 'object' || child === null || !('once' in child)) return;
  const once: unknown = child.once;
  if (typeof once !== 'function') return;
  // `exit` precedes `close`, and this listener precedes the caller's: the binary still exists.
  Reflect.apply(once, child, [
    'exit',
    (code: unknown) => {
      if (code === 0) noteLink(argv, true);
    },
  ]);
}

function installHooks(): void {
  // Reads are noted BEFORE the call: a read of a file that does not exist yet (a
  // `stator.config.json` looked up beside the input) is a dependency on its absence, so adding
  // that file later must select the test.
  for (const target of [fs, fsPromises]) {
    wrap(target, 'readFile', (args) => noteRead(args[0], false), 'before');
    wrap(target, 'readdir', (args) => noteRead(args[0], true), 'before');
  }
  wrap(fs, 'readFileSync', (args) => noteRead(args[0], false), 'before');
  wrap(fs, 'readdirSync', (args) => noteRead(args[0], true), 'before');
  wrap(fs, 'existsSync', (args) => noteRead(args[0], false), 'before');
  wrap(childProcess, 'spawnSync', (args, result) => {
    const status: unknown =
      typeof result === 'object' && result !== null && 'status' in result ? result.status : null;
    if (status === 0) noteLink(argvOf(args), true);
  });
  // Throws on a nonzero exit, so reaching the observer means the link succeeded.
  wrap(childProcess, 'execFileSync', (args) => {
    noteLink(argvOf(args), true);
  });
  for (const key of ['spawn', 'execFile']) {
    wrap(childProcess, key, (args, child) => {
      onExit(child, argvOf(args));
    });
  }
  for (const key of ['exec', 'execSync']) {
    wrap(childProcess, key, (args) => {
      if (typeof args[0] === 'string' && args[0].includes('-ljsrt')) noteLink(['-ljsrt'], false);
    });
  }
  syncBuiltinESMExports();
}

/* ---------------------------------------------------------------------------------------- */
/* In-process recording                                                                     */
/* ---------------------------------------------------------------------------------------- */

let session: Session | undefined;

const memory = { reads: new Set<string>(), native: new Set<string>() };
const memorySink: Sink = {
  read: (path) => memory.reads.add(path),
  native: (paths) => {
    for (const path of paths) memory.native.add(path);
  },
};

function fileSink(dir: string): Sink {
  makeDir(dir, { recursive: true });
  const file = join(dir, `impact-${String(process.pid)}-${uniqueSuffix()}.txt`);
  const seen = new Set<string>();
  const append = (line: string): void => {
    if (seen.has(line)) return;
    seen.add(line);
    appendText(file, `${line}\n`);
  };
  return {
    read: (path) => {
      append(`R ${path}`);
    },
    native: (paths) => {
      for (const path of paths) append(`N ${path}`);
    },
  };
}

/** One test's record as an in-process recorder writes it (merged by `record.ts`). */
export interface RawTest {
  readonly key: string;
  readonly spans: Record<string, Span[]>;
  readonly reads: string[];
  readonly native: string[];
}

export interface RawHarness {
  readonly harness: string;
  readonly files: Record<string, { all: Span[]; loadTime: Span[] }>;
  readonly loaded: string[];
  readonly reads: string[];
  readonly tests: RawTest[];
}

export interface InProcessRecorder {
  /** Call once, right before the first test: everything so far ran at load. */
  loaded(): Promise<void>;
  /** Call after each test, serially: everything since the last call ran for `key`. */
  take(key: string): Promise<void>;
  /** Write the harness record into `STATOR_IMPACT_RECORD`. */
  finish(): void;
}

function spanKey(span: Span): string {
  return `${String(span[0])}:${String(span[1])}`;
}

function parseSpanKey(key: string): Span {
  const [first, last] = key.split(':');
  return [Number(first), Number(last)];
}

/** The recorder an in-process runner (subset, golden) drives. `fixtureRoots` are the
 * repo-relative directories its tests live in: the runner's own listing of them is not a
 * harness-wide dependency (a fixture change selects that fixture, by path). */
export function inProcessRecorder(
  harness: string,
  fixtureRoots: readonly string[],
): InProcessRecorder {
  const active = session;
  const dir = RECORD_DIR;
  if (active === undefined || dir === undefined) {
    throw new Error(
      'impact: in-process recording needs `--import packages/tests/impact/preload.ts` with STATOR_IMPACT_RECORD and STATOR_IMPACT_INPROC=1',
    );
  }
  if (process.env['STATOR_TEST_JOBS'] !== '1') {
    throw new Error(
      'impact: in-process recording attributes coverage per test; set STATOR_TEST_JOBS=1',
    );
  }
  const converter = new CoverageConverter(REPO, (path) => readText(path, 'utf8'));
  const files = new Map<string, { all: Set<string>; loadTime: Set<string> }>();
  const loaded = new Set<string>();
  const harnessReads = new Set<string>();
  const tests: RawTest[] = [];

  const snapshot = async (): Promise<ReturnType<CoverageConverter['convert']>> => {
    const { result } = await active.post('Profiler.takePreciseCoverage');
    return quietly(() => converter.convert(result));
  };
  const fileOf = (path: string): { all: Set<string>; loadTime: Set<string> } => {
    let file = files.get(path);
    if (file === undefined) {
      file = { all: new Set(), loadTime: new Set() };
      files.set(path, file);
    }
    return file;
  };
  const drain = (): { reads: string[]; native: string[] } => {
    const out = { reads: [...memory.reads].sort(), native: [...memory.native].sort() };
    memory.reads.clear();
    memory.native.clear();
    return out;
  };

  return {
    async loaded(): Promise<void> {
      const snap = await snapshot();
      for (const file of snap.files) {
        const record = fileOf(file.path);
        for (const span of file.all) record.all.add(spanKey(span));
        if (file.rootRan) loaded.add(file.path);
        for (const span of file.executed) record.loadTime.add(spanKey(span));
      }
      for (const name of snap.packages) loaded.add(name);
      for (const path of drain().reads) {
        if (!fixtureRoots.some((root) => path.startsWith(root))) harnessReads.add(path);
      }
    },
    async take(key: string): Promise<void> {
      const snap = await snapshot();
      const spans: Record<string, Span[]> = {};
      for (const file of snap.files) {
        const record = fileOf(file.path);
        for (const span of file.all) record.all.add(spanKey(span));
        if (file.rootRan) {
          // Loaded lazily, inside this test: from now on it is the harness's, and what ran
          // while it loaded is load-time code like any other module's.
          loaded.add(file.path);
          for (const span of file.executed) record.loadTime.add(spanKey(span));
        }
        if (file.executed.length > 0) spans[file.path] = [...file.executed];
      }
      for (const name of snap.packages) loaded.add(name);
      const { reads, native } = drain();
      tests.push({ key, spans, reads, native });
    },
    finish(): void {
      const out: RawHarness = {
        harness,
        files: Object.fromEntries(
          [...files].map(([path, file]) => [
            path,
            {
              all: [...file.all].map(parseSpanKey),
              loadTime: [...file.loadTime].map(parseSpanKey),
            },
          ]),
        ),
        loaded: [...loaded].sort(),
        reads: [...harnessReads].sort(),
        tests,
      };
      makeDir(dir, { recursive: true });
      writeText(
        join(dir, `${harness}-${String(process.pid)}-${uniqueSuffix()}.raw.json`),
        `${JSON.stringify(out)}\n`,
      );
    },
  };
}

/** The `--import` entry point (see preload.ts). */
export async function installRecorder(): Promise<void> {
  if (RECORD_DIR === undefined || sink !== undefined) return;
  if (process.env['STATOR_IMPACT_INPROC'] === '1') {
    session = new Session();
    session.connect();
    await session.post('Profiler.enable');
    await session.post('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
    sink = memorySink;
  } else {
    sink = fileSink(RECORD_DIR);
  }
  installHooks();
}
