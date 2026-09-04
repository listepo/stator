/* The process pool the test runners share.
 *
 * Task 6.1 built the first one (plan.md §9) because a serial Test262 pass is ~5 hours and a
 * conformance heartbeat nobody can afford to run is the same as not having one. The subset and
 * golden runners have the same shape — hundreds of `stator` spawns, each independent — and were
 * still serial, so this is that pool extracted rather than copied a third time (AGENTS.md: find the
 * existing helper and reuse it, or extract one shared helper at the responsible layer).
 *
 * Two invariants the callers depend on, both learned in Task 6.1:
 *
 * - **Results are indexed by ITEM, never by completion order.** A pool finishes out of order by
 *   construction, so a runner that pushed as it went would emit a different failure list on every
 *   run and a different `results.json` on every commit. Ordering the output is what keeps a
 *   parallel run's report diffable against a serial one's.
 * - **Nothing here is keyed by pid.** Anything a worker writes to disk needs a name unique to the
 *   CALL, not to the process: keyed by pid alone, two workers in one process would compile each
 *   other's source and report the answer to the wrong test. Callers get `slot` for that, and
 *   `mkdtemp` is the other correct answer.
 */
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';

export interface ProcessResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunOptions {
  readonly timeoutMs?: number;
  readonly env?: NodeJS.ProcessEnv;
}

/** Async `spawnSync`, so a pool can keep every core busy. */
export function runProcess(
  command: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    // Built conditionally: `exactOptionalPropertyTypes` is on, so an explicit `undefined` is not
    // the same as an absent key, and `spawn` treats a present `timeout: undefined` as a real value.
    const spawnOptions = {
      ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
      ...(options.env === undefined ? {} : { env: options.env }),
    };
    const child = spawn(command, [...args], spawnOptions);
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    // `error` fires without `close` when the spawn itself failed, and WITH it when the timeout
    // killed a running child. Settling on `close` whenever the child exists keeps a caller's
    // temp-file cleanup from racing a process that is still reading its input.
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

/** Run `work` over `items` on a fixed-size pool, one slot per core.
 *
 * Each slot pulls the next item, so a slow compile never idles the others — which a chunked split
 * would, since the chunk holding the one 5-second fixture decides the whole run's wall time. */
export async function pool<T, R>(
  items: readonly T[],
  work: (item: T, slot: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  // `STATOR_TEST_JOBS=1` forces the serial order back. It is how a parallel run's report gets
  // compared against a serial one's when a failure looks like it came from the pool itself, and a
  // machine that must not be saturated (a shared CI box) has the same knob.
  const requested = Number.parseInt(process.env['STATOR_TEST_JOBS'] ?? '', 10);
  const cores = Number.isFinite(requested) && requested > 0 ? requested : availableParallelism();
  const width = Math.max(1, Math.min(cores, items.length));
  await Promise.all(
    Array.from({ length: width }, async (_unused, slot) => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        const item = items[index];
        // A hole SKIPS rather than ends the slot's loop: `noUncheckedIndexedAccess` makes the read
        // `T | undefined`, and returning here would silently truncate the run at the first one.
        if (item === undefined) continue;
        results[index] = await work(item, slot);
      }
    }),
  );
  return results;
}
