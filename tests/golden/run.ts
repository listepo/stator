/* Golden-test runner (plan.md §5 Task 2.6).
 *
 * Ground truth is the pinned Node in .node-version — that Node and only that Node.
 * Each fixture under tests/golden/ts|js is (a) compiled by stator and executed, and
 * (b) executed directly by Node. stdout must match BYTE-FOR-BYTE, number formatting
 * included (Ryu shortest-round-trip). A mismatch is a semantics bug: never loosen the
 * comparison to make it pass.
 */
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, runProcess } from '../support/parallel.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const CLI = join(REPO, 'src', 'cli', 'main.ts');

/* Every fixture runs with `TZ` PINNED (plan.md §7 Task 4.2, Date step 8). Without it a local-time
 * fixture asserts what the machine's time zone happens to be, which is not a property of the
 * compiler -- and it would pass on the author's laptop and fail in CI, or worse, pass in both for
 * different reasons. UTC specifically, because the compiled binary reads the tzdb through libc's
 * `localtime_r` while Node reads it through ICU: for UTC those two cannot disagree, while for a
 * real zone a tzdata skew between them would surface as a golden diff that looks like a semantics
 * bug and is not. Local-vs-UTC behaviour that UTC makes indistinguishable is proved instead by
 * runtime unit tests under an explicit non-UTC `TZ`, where a disagreement is visible as itself.
 *
 * Applied to BOTH sides, and to the build too so a compile-time constant fold can never see a
 * different zone from the run that checks it. */
const PINNED_ENV = { ...process.env, TZ: 'UTC' };

/* Fixtures named `intl_*` exercise the ICU feature build (Task 4.4), which is off by default and
 * may be absent on a machine entirely. They are SKIPPED unless this run links that archive, so
 * `pnpm run ci` stays green without ICU and `pnpm run test:intl` is what turns them on. */
const INTL = process.env['STATOR_RUNTIME'] === 'intl';

/** A directory's entry is `main.<mode>`, except a js-mode mixed graph may enter at `main.ts`.
 *
 * js mode compiles TypeScript (plan.md §8 step 5): the point of that fixture is a `.ts` file
 * importing an untyped `.js` module, and looking only for `main.js` would skip it. */
function fixtureEntry(dir: string, name: string, mode: 'ts' | 'js'): string {
  if (name.endsWith(`.${mode}`)) {
    return join(dir, name);
  }
  const folder = join(dir, name);
  const preferred = join(folder, `main.${mode}`);
  if (mode === 'js' && !existsSync(preferred)) {
    const tsEntry = join(folder, 'main.ts');
    if (existsSync(tsEntry)) {
      return tsEntry;
    }
  }
  return preferred;
}

function fixtures(mode: 'ts' | 'js'): { mode: 'ts' | 'js'; path: string; name: string }[] {
  const dir = join(HERE, mode);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  // A DIRECTORY is a multi-file fixture: its entry point is `main.<mode>` (or `main.ts` in js mode) and the other
  // files in it are modules the entry imports. Stator compiles the whole graph from the
  // entry; Node likewise runs just the entry — both resolve the imports themselves.
  return names
    .filter(
      (name) =>
        (INTL || !name.startsWith('intl_')) &&
        (name.endsWith(`.${mode}`) ||
          statSync(join(dir, name), { throwIfNoEntry: false })?.isDirectory()),
    )
    .sort()
    .map((name) => ({
      mode,
      name,
      path: fixtureEntry(dir, name, mode),
    }));
}

/* Both streams, because console.error/warn write to STDERR in Node and the runtime mirrors
 * that — comparing stdout alone would let a wrong-stream bug pass. */
interface Streams {
  readonly stdout: string;
  readonly stderr: string;
}

/* `mkdtemp` — not a slot-keyed name — is what makes this safe to run on the pool: the output
 * binary and its intermediates live in a directory unique to THIS CALL, so two workers can never
 * compile into each other's `app`. */
async function runCompiled(path: string, mode: 'ts' | 'js'): Promise<Streams> {
  const work = mkdtempSync(join(tmpdir(), 'stator-golden-'));
  try {
    const out = join(work, 'app');
    const build = await runProcess(
      process.execPath,
      [CLI, 'build', path, '-o', out, `--mode=${mode}`],
      { env: PINNED_ENV },
    );
    if (build.status !== 0) {
      throw new Error(`stator build failed: ${build.stderr.trim()}`);
    }
    const exec = await runProcess(out, [], { env: PINNED_ENV });
    if (exec.status !== 0) {
      throw new Error(`compiled binary exited ${String(exec.status)}: ${exec.stderr.trim()}`);
    }
    return { stdout: exec.stdout, stderr: exec.stderr };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function runNode(path: string): Promise<Streams> {
  const result = await runProcess(process.execPath, [path], { env: PINNED_ENV });
  if (result.status !== 0) {
    throw new Error(`node exited ${String(result.status)}: ${result.stderr.trim()}`);
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

async function main(): Promise<void> {
  const all = [...fixtures('ts'), ...fixtures('js')];

  // One result per fixture, indexed by fixture: the pool completes out of order, and a golden
  // report whose failure order shifted run to run would be unreadable as a diff.
  const results = await pool(all, async (fixture): Promise<string | undefined> => {
    try {
      const [actual, expected] = await Promise.all([
        runCompiled(fixture.path, fixture.mode),
        runNode(fixture.path),
      ]);
      if (actual.stdout === expected.stdout && actual.stderr === expected.stderr) {
        return undefined;
      }
      const stream = actual.stdout === expected.stdout ? 'stderr' : 'stdout';
      return `${fixture.mode}/${fixture.name}: ${stream} differs\n  stator: ${JSON.stringify(actual[stream])}\n  node:   ${JSON.stringify(expected[stream])}`;
    } catch (error) {
      return `${fixture.mode}/${fixture.name}: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  const failures = results.filter((result) => result !== undefined);
  const passed = all.length - failures.length;

  for (const failure of failures) {
    process.stderr.write(`FAIL ${failure}\n`);
  }
  process.stdout.write(
    `golden: ${String(all.length)} fixtures — ${String(passed)} passed, ${String(failures.length)} failed\n`,
  );
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

await main();
