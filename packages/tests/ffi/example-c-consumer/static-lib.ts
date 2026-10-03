/* Task 7.4 Check (plan.md §10): `--emit=lib` gives a C build everything it needs in three files.
 *
 * - `unit.ts` builds to `libconsumer.a` + `consumer.h` + `libconsumer.pc` twice, and the two
 *   builds must be byte-identical (the archive only in the default flavor: the sanitized one
 *   compiles with `-g`, whose debug map names the scratch directory).
 * - The three files and `main.c` are copied to a fresh directory, must hold no path into this
 *   repository, and `main.c` links through `pkg-config --cflags --libs libconsumer` alone, runs,
 *   and prints `expected.txt`.
 * - `keeper.ts` builds to a second library, and `two.c` links BOTH into one program: two private
 *   runtimes over one Boehm, with forced collections that `two.c` confirms through
 *   `GC_get_gc_no` (plan-notes 341, 342). CI has Boehm, so there a run without it fails.
 *
 * `STATOR_RUNTIME=asan` (the ASan gate's stage) builds against the sanitized runtime; the
 * libraries then carry `-fsanitize` in their `.pc`, so the consumer link is unchanged.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRuntime, selectCC } from '../../../compiler/src/cli/build.ts';
import { linkConsumer, makeFail, run, type Fail } from '../../support/c-runner.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..', '..');
const CLI = join(HERE, '..', '..', '..', 'compiler', 'src', 'cli', 'main.ts');
const RUNTIME = resolveRuntime();
const SANITIZED = RUNTIME.sanitized;

const fail: Fail = makeFail('ffi static-lib');

/** `stator build --emit=lib` of `source` as unit `unit` into `dir`. */
function buildLibrary(source: string, unit: string, dir: string): void {
  mkdirSync(dir, { recursive: true });
  run(
    process.execPath,
    [
      CLI,
      'build',
      join(HERE, source),
      '--emit=lib',
      '-o',
      join(dir, `lib${unit}.a`),
      `--emit-header=${join(dir, `${unit}.h`)}`,
      '--unit-name',
      unit,
    ],
    `stator build --emit=lib (${unit})`,
    fail,
  );
}

/** The files a consumer is handed, by name. */
function libraryFiles(unit: string): string[] {
  return [`lib${unit}.a`, `${unit}.h`, `lib${unit}.pc`];
}

/** Copies `unit`'s three files to `to`, refusing any that names this repository. */
function deliver(from: string, unit: string, to: string): void {
  for (const name of libraryFiles(unit)) {
    copyFileSync(join(from, name), join(to, name));
    // The sanitized archive's debug info names the runtime's sources; that flavor is a test
    // build, never one handed to a consumer.
    if (SANITIZED && name.endsWith('.a')) {
      continue;
    }
    if (readFileSync(join(to, name)).includes(REPO)) {
      fail(`${name} names the repository path ${REPO}`);
    }
  }
}

function pkgConfig(dir: string, names: readonly string[]): string[] {
  const result = spawnSync('pkg-config', ['--cflags', '--libs', ...names], {
    encoding: 'utf8',
    env: { ...process.env, PKG_CONFIG_PATH: dir },
  });
  if (result.error !== undefined || result.status !== 0) {
    fail(
      `pkg-config ${names.join(' ')} failed (is pkg-config installed?):\n` +
        `${result.stderr ?? ''}${result.error?.message ?? ''}`,
    );
  }
  return result.stdout.trim().split(/\s+/);
}

/** Links `source` in `dir` against the named libraries through pkg-config only, runs it, and
 * returns its stdout. `boehm` reports whether the libraries link Boehm. */
function linkAndRun(
  dir: string,
  source: string,
  names: readonly string[],
): { output: string; boehm: boolean } {
  const flags = pkgConfig(dir, names);
  const boehm = flags.includes('-lgc');
  const app = join(dir, source.replace(/\.c$/, ''));
  linkConsumer(
    selectCC(RUNTIME),
    [
      '-std=c11',
      '-Wall',
      '-Wextra',
      '-Werror',
      ...(boehm ? ['-DSTATOR_TEST_BOEHM'] : []),
      join(dir, source),
      ...flags,
      '-o',
      app,
    ],
    fail,
  );
  return { output: run(app, [], source, fail), boehm };
}

function main(): void {
  const work = mkdtempSync(join(tmpdir(), 'stator-static-lib-'));
  try {
    const first = join(work, 'first');
    const second = join(work, 'second');
    buildLibrary('unit.ts', 'consumer', first);
    buildLibrary('unit.ts', 'consumer', second);
    for (const name of libraryFiles('consumer')) {
      if (SANITIZED && name.endsWith('.a')) {
        continue;
      }
      if (!readFileSync(join(first, name)).equals(readFileSync(join(second, name)))) {
        fail(`two builds of the same input gave byte-different ${name}`);
      }
    }
    buildLibrary('keeper.ts', 'keeper', join(work, 'keeper'));

    const consumer = join(work, 'consumer-app');
    mkdirSync(consumer);
    deliver(first, 'consumer', consumer);
    copyFileSync(join(HERE, 'main.c'), join(consumer, 'main.c'));
    const one = linkAndRun(consumer, 'main.c', ['libconsumer']);
    const expected = readFileSync(join(HERE, 'expected.txt'), 'utf8');
    if (one.output !== expected) {
      fail(
        `output differs\n  actual:   ${JSON.stringify(one.output)}\n` +
          `  expected: ${JSON.stringify(expected)}`,
      );
    }

    const both = join(work, 'two-app');
    mkdirSync(both);
    deliver(first, 'consumer', both);
    deliver(join(work, 'keeper'), 'keeper', both);
    copyFileSync(join(HERE, 'two.c'), join(both, 'two.c'));
    const two = linkAndRun(both, 'two.c', ['libconsumer', 'libkeeper']);
    if (two.output !== 'keeper=5000\ntwo libraries ok\n') {
      fail(`two-library output differs: ${JSON.stringify(two.output)}`);
    }
    if (!two.boehm && process.env['CI'] !== undefined) {
      fail('the runtime links no Boehm, so no collection ran — CI must prove one');
    }
    process.stdout.write(
      `ffi static-lib: ok (${SANITIZED ? 'asan, ' : ''}two libraries, ` +
        `${two.boehm ? 'forced Boehm collections' : 'no collector'})\n`,
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main();
