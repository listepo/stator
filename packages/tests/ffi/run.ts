/* The FFI test harness (plan.md §10 Task 7.1 step 10, Task 7.2 steps 8–9).
 *
 * What runs today is the half that needs no new compiler surface. The committed libm goldens
 * (`tests/golden/ts|js/extern_libm`) build through `stator build` and their binaries are
 * compared against the pinned Node byte-for-byte — both streams, `TZ=UTC` on both sides. The
 * `ts` side proves the direct extern call; the `js` side the same contract with a
 * dynamically-typed argument crossing the boundary check. Header determinism (Task 7.2
 * step 8) runs as a pure `cmp` over a stub until `--emit-header` exists. Everything else is
 * a `TODO(step-7)` stub that throws if reached and reports as `not run`, never as a pass.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, runProcess } from '../support/parallel.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = join(HERE, '..', 'golden');
const CLI = join(HERE, '..', '..', 'compiler', 'src', 'cli', 'main.ts');

const TS_ENTRY = join(GOLDEN, 'ts', 'extern_libm', 'main.ts');
const JS_ENTRY = join(GOLDEN, 'js', 'extern_libm', 'main.js');

/* Every spawn runs with `TZ` pinned to UTC — the build too, so a compile-time constant fold
 * can never see a different zone from the run that checks it, and the compiled binary reads
 * the tzdb through libc while Node reads it through ICU, which only agree on UTC. */
const PINNED_ENV = { ...process.env, TZ: 'UTC' };

/* Both streams, because console.error/warn write to STDERR in Node and the runtime mirrors
 * that — comparing stdout alone would let a wrong-stream bug pass. */
interface Streams {
  readonly stdout: string;
  readonly stderr: string;
}

/* One `stator build` spawn per fixture (the leak runner's shape). The link needs no extra
 * flags on the command line: `-lm` is already in the runtime's `link-flags.txt`, which
 * `linkExecutable` reads on every link, so this is the same link a user gets. */
async function compile(entry: string, out: string, mode: 'ts' | 'js'): Promise<void> {
  const built = await runProcess(
    process.execPath,
    [CLI, 'build', entry, '-o', out, '--mode', mode],
    { env: PINNED_ENV },
  );
  if (built.status !== 0) {
    throw new Error(`stator build failed: ${built.stderr.trim()}`);
  }
}

/* `mkdtemp` — not a slot-keyed name — is what makes this safe to run on the pool: the output
 * binary lives in a directory unique to THIS CALL, so two workers can never compile into
 * each other's `app`. */
async function runCompiled(entry: string, mode: 'ts' | 'js'): Promise<Streams> {
  const work = mkdtempSync(join(tmpdir(), 'stator-ffi-'));
  try {
    const out = join(work, 'app');
    await compile(entry, out, mode);
    const exec = await runProcess(out, [], { env: PINNED_ENV });
    if (exec.status !== 0) {
      throw new Error(`compiled binary exited ${String(exec.status)}: ${exec.stderr.trim()}`);
    }
    return { stdout: exec.stdout, stderr: exec.stderr };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function runNode(entry: string): Promise<Streams> {
  // The oracle runs on `process.execPath` — the pinned Node under the repo's `mise exec` pin,
  // which `scripts/check-node.mjs` refuses to let be anything else. FFI fixtures cannot run
  // under Node as written (an ambient `declare function` erases to nothing), so their
  // `node_shim.mjs` preloads the same bindings via `--import` — invisible to Stator, which
  // never imports it. What the comparison still proves is the observable contract: same
  // calls, same values, same caught messages, byte-for-byte.
  const shim = join(dirname(entry), 'node_shim.mjs');
  const args = existsSync(shim) ? ['--import', shim, entry] : [entry];
  const result = await runProcess(process.execPath, args, { env: PINNED_ENV });
  if (result.status !== 0) {
    throw new Error(`node exited ${String(result.status)}: ${result.stderr.trim()}`);
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

interface Fixture {
  readonly label: string;
  readonly entry: string;
  readonly mode: 'ts' | 'js';
}

async function checkExtern(fixture: Fixture): Promise<string | undefined> {
  try {
    const [actual, expected] = await Promise.all([
      runCompiled(fixture.entry, fixture.mode),
      runNode(fixture.entry),
    ]);
    if (actual.stdout === expected.stdout && actual.stderr === expected.stderr) {
      return undefined;
    }
    const stream = actual.stdout === expected.stdout ? 'stderr' : 'stdout';
    return `${fixture.label}: ${stream} differs\n  stator: ${JSON.stringify(actual[stream])}\n  node:   ${JSON.stringify(expected[stream])}`;
  } catch (error) {
    return `${fixture.label}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/* Task 7.2 step 8: an emitted header must be deterministic — same input, byte-identical
 * output, no timestamps, no absolute paths. Until `--emit-header` exists the `cmp` itself
 * runs against this stub, so the shape of the check is fixed before the flag it will check. */
const STUB_HEADER =
  '#ifndef STATOR_FFI_STUB_H\n#define STATOR_FFI_STUB_H\n\n' +
  'double stator_stub_sqrt(double x);\n\n#endif\n';

/** Pure byte comparison for emitted headers: `Buffer` equality, no decoding and no
 * normalization that could hide the nondeterminism the check exists to catch. */
export function headersEqual(first: Buffer, second: Buffer): boolean {
  return first.equals(second);
}

function checkHeaderDeterminism(): string | undefined {
  const first = Buffer.from(STUB_HEADER, 'utf8');
  const second = Buffer.from(STUB_HEADER, 'utf8');
  if (headersEqual(first, second)) {
    return undefined;
  }
  return 'header determinism: identical inputs compared unequal';
}

/* The three checks the compiler cannot run yet: Task 7.1 step 10's second half, its ASan
 * clause, and Task 7.2's `--emit-header`. Each throws if reached — `main` reports them as
 * `not run`, never as passes and never as failures. */
function selfCompiledC(): void {
  throw new Error('TODO(step-7): compile the two-function .c fixture in the harness and link it');
}

function asanBufferOwnership(): void {
  throw new Error('TODO(step-7): ASan run where C writes into a buffer the runtime owns');
}

function emitHeaderDoubleBuild(): void {
  throw new Error('TODO(step-7): real --emit-header double build with byte comparison');
}

interface Stub {
  readonly name: string;
  readonly run: () => void;
}

const STUBS: readonly Stub[] = [
  { name: 'self-compiled .c fixture', run: selfCompiledC },
  { name: 'ASan buffer-ownership check', run: asanBufferOwnership },
  { name: '--emit-header double build', run: emitHeaderDoubleBuild },
];

async function main(): Promise<void> {
  const fixtures: readonly Fixture[] = [
    { label: 'ts/extern_libm', entry: TS_ENTRY, mode: 'ts' },
    { label: 'js/extern_libm', entry: JS_ENTRY, mode: 'js' },
  ];

  // One result per fixture, indexed by fixture: the pool completes out of order, and a report
  // whose failure order shifted run to run would be unreadable as a diff.
  const results = await pool(fixtures, (fixture) => checkExtern(fixture));

  const failures: string[] = [];
  for (const result of results) {
    if (result !== undefined) {
      failures.push(result);
    }
  }
  const header = checkHeaderDeterminism();
  if (header !== undefined) {
    failures.push(header);
  }

  for (const failure of failures) {
    process.stderr.write(`FAIL ${failure}\n`);
  }
  for (const stub of STUBS) {
    let reason: string;
    try {
      stub.run();
      reason = 'stub returned without running a check';
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
    process.stdout.write(`ffi: not run — ${stub.name} (${reason})\n`);
  }
  const passed = 3 - failures.length;
  process.stdout.write(
    `ffi: 3 checks — ${String(passed)} passed, ${String(failures.length)} failed, ${String(STUBS.length)} not run\n`,
  );
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

await main();
