/* The FFI test harness (plan.md §10 Task 7.1 step 10, Task 7.2 steps 8–9).
 *
 * Usage: node packages/tests/ffi/run.ts [--filter <substring> | --filter=<substring>]
 *
 * Five checks, every one a real build compared against the pinned Node byte-for-byte (both
 * streams, `TZ=UTC` on both sides):
 *
 * - `ts/extern_libm` and `js/extern_libm`: the committed libm goldens through an in-process
 *   `build()` (the golden runner's pattern) — the `ts` side the direct extern call, the `js`
 *   side the same contract with a dynamically-typed argument crossing the boundary check.
 *   `-lm` needs no plumbing: it rides every link inside the runtime's `link-flags.txt`.
 * - `self-compiled .c`: the `ts/extern_ptr` golden's two-function fixture C (`ffi.c`, no
 *   header) compiled here with the same C11 `-Wall -Wextra -Werror` discipline as the
 *   runtime, the objects linked through the `--link=` channel (docs/FFI.md §9) — the
 *   `extraLinkFlags` consumer path, exercised by a test instead of asserted by a comment.
 * - `--emit-header double build`: a small exported-function fixture built twice in-process;
 *   the two headers must compare byte-identical with `headersEqual` (docs/FFI.md §8: no
 *   timestamps, no absolute paths, no hash-ordered iteration).
 * - `asan buffer ownership`: the same `extern_ptr` fixture — C `memset`/`memcmp` into
 *   `malloc`'d blocks — linked against the sanitized archive under `STATOR_RUNTIME=asan`.
 *   A buffer overrun aborts the binary instead of diffing, so any sanitizer report fails the
 *   check. The flavor pins at `build.ts` module load, so this one spawns the CLI where the
 *   rest build in-process. With no `build-asan/libjsrt.a` the check reports `not run`.
 *
 * A check that cannot run reports `not run`, never a pass and never a failure — the summary
 * counts all three separately.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFixture,
  compileFixtureC,
  runNodeOracle,
  type FixtureStreams,
} from '../support/fixture-build.ts';
import { pool, runProcess } from '../support/parallel.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = join(HERE, '..', 'golden');
const RUNTIME_ROOT = join(HERE, '..', '..', 'runtime');
const CLI = join(HERE, '..', '..', 'compiler', 'src', 'cli', 'main.ts');
const ASAN_ARCHIVE = join(RUNTIME_ROOT, 'build-asan', 'libjsrt.a');

const TS_LIBM_ENTRY = join(GOLDEN, 'ts', 'extern_libm', 'main.ts');
const JS_LIBM_ENTRY = join(GOLDEN, 'js', 'extern_libm', 'main.js');
const PTR_ENTRY = join(GOLDEN, 'ts', 'extern_ptr', 'main.ts');

/* Every spawn runs with `TZ` pinned to UTC — the build too, so a compile-time constant fold
 * can never see a different zone from the run that checks it, and the compiled binary reads
 * the tzdb through libc while Node reads it through ICU, which only agree on UTC. */
const PINNED_ENV = { ...process.env, TZ: 'UTC' };

/* In-process `build()` reads the process environment directly — there is no spawn to carry
 * `PINNED_ENV` — so the pin has to hold here too, for the same reason (the golden runner's
 * pattern). */
process.env['TZ'] = 'UTC';

/* `--filter <substring>` (or `--filter=<substring>`) narrows the run to checks whose name
 * contains the substring — developer iteration speed, so debugging one check does not rebuild
 * every fixture. A filter that matches nothing prints the zero-line and exits 0. */
function parseFilter(argv: readonly string[]): string | undefined {
  let filter: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--filter') {
      const value = argv[index + 1];
      if (value === undefined) {
        throw new Error('--filter requires a value');
      }
      filter = value;
      index += 1;
    } else if (arg !== undefined && arg.startsWith('--filter=')) {
      filter = arg.slice('--filter='.length);
    }
  }
  return filter;
}

/* `mkdtemp` — not a slot-keyed name — is what makes this safe to run on the pool: the output
 * binary and its intermediates live in a directory unique to THIS CALL, so two workers can
 * never compile into each other's `app`. */
async function runCompiled(entry: string, mode: 'ts' | 'js'): Promise<FixtureStreams> {
  const work = mkdtempSync(join(tmpdir(), 'stator-ffi-'));
  try {
    const objects = await compileFixtureC(entry, work);
    const out = join(work, 'app');
    await buildFixture({ entry, out, mode, linkFlags: objects });
    const exec = await runProcess(out, [], { env: PINNED_ENV });
    if (exec.status !== 0) {
      throw new Error(`compiled binary exited ${String(exec.status)}: ${exec.stderr.trim()}`);
    }
    return { stdout: exec.stdout, stderr: exec.stderr };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

type CheckOutcome =
  | { readonly kind: 'passed' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'not-run'; readonly reason: string };

interface Check {
  readonly name: string;
  readonly run: () => Promise<CheckOutcome>;
}

function diffMessage(name: string, actual: FixtureStreams, expected: FixtureStreams): string {
  const stream = actual.stdout === expected.stdout ? 'stderr' : 'stdout';
  return `${name}: ${stream} differs\n  stator: ${JSON.stringify(actual[stream])}\n  node:   ${JSON.stringify(expected[stream])}`;
}

async function checkExtern(name: string, entry: string, mode: 'ts' | 'js'): Promise<CheckOutcome> {
  try {
    const [actual, expected] = await Promise.all([
      runCompiled(entry, mode),
      runNodeOracle(entry, PINNED_ENV),
    ]);
    if (actual.stdout === expected.stdout && actual.stderr === expected.stderr) {
      return { kind: 'passed' };
    }
    return { kind: 'failed', message: diffMessage(name, actual, expected) };
  } catch (error) {
    return {
      kind: 'failed',
      message: `${name}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/* Task 7.2 step 8: an emitted header must be deterministic — same input, byte-identical
 * output, no timestamps, no absolute paths. Two real in-process `--emit-header` builds of one
 * small exported-function fixture, compared with `headersEqual` below; any mismatch fails
 * loudly rather than diffing, because a diff of generated C invites "fixing" the expectation. */
const HEADER_FIXTURE =
  'export function add(a: number, b: number): number {\n  return a + b;\n}\n' +
  'export function truth(): boolean {\n  return true;\n}\n' +
  'export const VERSION: number = 1;\n' +
  'console.log(add(1, 2));\n';

/** Pure byte comparison for emitted headers: `Buffer` equality, no decoding and no
 * normalization that could hide the nondeterminism the check exists to catch. */
export function headersEqual(first: Buffer, second: Buffer): boolean {
  return first.equals(second);
}

async function checkEmitHeaderDoubleBuild(): Promise<CheckOutcome> {
  const name = '--emit-header double build';
  const work = mkdtempSync(join(tmpdir(), 'stator-ffi-header-'));
  try {
    const entry = join(work, 'widget.ts');
    writeFileSync(entry, HEADER_FIXTURE);
    const firstHeader = join(work, 'first.h');
    const secondHeader = join(work, 'second.h');
    // `--emit-header` compiles a relocatable object, never links: this check proves the
    // header half even where the link half cannot run.
    await buildFixture({
      entry,
      out: join(work, 'first.o'),
      mode: 'ts',
      linkFlags: [],
      emitHeader: firstHeader,
      unitName: 'widget',
    });
    await buildFixture({
      entry,
      out: join(work, 'second.o'),
      mode: 'ts',
      linkFlags: [],
      emitHeader: secondHeader,
      unitName: 'widget',
    });
    if (headersEqual(readFileSync(firstHeader), readFileSync(secondHeader))) {
      return { kind: 'passed' };
    }
    return {
      kind: 'failed',
      message: `${name}: same input emitted byte-different headers`,
    };
  } catch (error) {
    return {
      kind: 'failed',
      message: `${name}: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/* Task 7.1 step 10's ASan clause (docs/FFI.md §8): C writes into `malloc`'d blocks through
 * `memset` and reads them back through `memcmp` — under the sanitized archive any overrun or
 * use-after-free aborts the binary, which fails the check instead of diffing. The flavor pins
 * at `build.ts` module load, so the sanitized link cannot go through the in-process `build()`
 * the other checks use: this one spawns the CLI with `STATOR_RUNTIME=asan` (the asan-gate's
 * shape, `detect_leaks=0` included). Fixture C stays uninstrumented, as in the golden runner:
 * what the sanitizer watches is the runtime-owned buffers C writes into, not the fixture. */
async function checkAsanBufferOwnership(): Promise<CheckOutcome> {
  const name = 'asan buffer ownership';
  if (!existsSync(ASAN_ARCHIVE)) {
    return {
      kind: 'not-run',
      reason: `no sanitized archive at ${ASAN_ARCHIVE} — build it with the runtime-asan recipe first`,
    };
  }
  const work = mkdtempSync(join(tmpdir(), 'stator-ffi-asan-'));
  try {
    const objects = await compileFixtureC(PTR_ENTRY, work);
    const out = join(work, 'app');
    const built = await runProcess(
      process.execPath,
      [
        CLI,
        'build',
        PTR_ENTRY,
        '-o',
        out,
        '--mode',
        'ts',
        ...objects.flatMap((object) => ['--link', object]),
      ],
      { env: { ...PINNED_ENV, STATOR_RUNTIME: 'asan', ASAN_OPTIONS: 'detect_leaks=0' } },
    );
    if (built.status !== 0) {
      throw new Error(`stator build (asan) failed: ${built.stderr.trim()}`);
    }
    const exec = await runProcess(out, [], {
      env: { ...PINNED_ENV, ASAN_OPTIONS: 'detect_leaks=0' },
    });
    if (exec.status !== 0) {
      throw new Error(`asan binary exited ${String(exec.status)}: ${exec.stderr.trim()}`);
    }
    const expected = await runNodeOracle(PTR_ENTRY, PINNED_ENV);
    if (exec.stdout === expected.stdout && exec.stderr === expected.stderr) {
      return { kind: 'passed' };
    }
    return {
      kind: 'failed',
      message: diffMessage(name, { stdout: exec.stdout, stderr: exec.stderr }, expected),
    };
  } catch (error) {
    return {
      kind: 'failed',
      message: `${name}: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const filter = parseFilter(process.argv.slice(2));
  const all: readonly Check[] = [
    {
      name: 'ts/extern_libm',
      run: () => checkExtern('ts/extern_libm', TS_LIBM_ENTRY, 'ts'),
    },
    {
      name: 'js/extern_libm',
      run: () => checkExtern('js/extern_libm', JS_LIBM_ENTRY, 'js'),
    },
    {
      name: 'self-compiled .c (ts/extern_ptr)',
      run: () => checkExtern('self-compiled .c (ts/extern_ptr)', PTR_ENTRY, 'ts'),
    },
    { name: '--emit-header double build', run: checkEmitHeaderDoubleBuild },
    { name: 'asan buffer ownership', run: checkAsanBufferOwnership },
  ];
  const checks = filter === undefined ? all : all.filter((check) => check.name.includes(filter));

  // One result per check, indexed by check: the pool completes out of order, and a report
  // whose failure order shifted run to run would be unreadable as a diff.
  const outcomes = await pool(checks, (check) => check.run());

  let passed = 0;
  let failed = 0;
  let notRun = 0;
  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index];
    const outcome = outcomes[index];
    if (check === undefined || outcome === undefined) {
      continue;
    }
    if (outcome.kind === 'passed') {
      passed += 1;
    } else if (outcome.kind === 'failed') {
      failed += 1;
      process.stderr.write(`FAIL ${outcome.message}\n`);
    } else {
      notRun += 1;
      process.stdout.write(`ffi: not run — ${check.name} (${outcome.reason})\n`);
    }
  }
  process.stdout.write(
    `ffi: ${String(checks.length)} checks — ${String(passed)} passed, ${String(failed)} failed, ${String(notRun)} not run\n`,
  );
  if (failed > 0) {
    process.exitCode = 1;
  }
}

await main();
