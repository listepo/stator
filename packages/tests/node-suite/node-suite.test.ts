/* Node's own tests through Stator (plan.md §11c T11.7). Run: `pnpm run test:node-suite`, which
 * fetches the pinned corpus first (fetch.ts) and then this file under vitest.config.ts.
 *
 * One vitest test per selected file. A `skip` is reported, never run. Every other file must
 * first pass under the pinned Node with host-hook.ts (a host failure is a `skip`, never a
 * `fail`); then it is built with `--mode=js --node` and its binary run, passing on exit 0. The
 * ratchet: a `pass` that fails, or a `fail` that passes, fails the run until expectations.json
 * says what happened. */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, test } from 'vitest';
import { buildFixture } from '../support/fixture-build.ts';
import { nodePath } from '../support/node-path.ts';
import { runProcess } from '../support/parallel.ts';
import { CORPUS, loadExpectations, loadPin, type Expectation } from './suite.ts';

const HOOK = fileURLToPath(new URL('host-hook.ts', import.meta.url));
const PARALLEL = join(CORPUS, 'test', 'parallel');
const PINNED_ENV = { ...process.env, TZ: 'UTC' };
const { tag } = loadPin();
const selection = loadExpectations();
const tally = { pass: 0, fail: 0, skip: 0 };

/** Why Stator's build or binary failed, or `undefined` when it passed. */
async function statorFailure(file: string): Promise<string | undefined> {
  const work = mkdtempSync(join(tmpdir(), 'stator-node-suite-'));
  try {
    const out = join(work, 'test');
    try {
      await buildFixture({ entry: file, out, mode: 'js', node: true });
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    const run = await runProcess(out, [], { env: PINNED_ENV, cwd: CORPUS });
    if (run.status === 0) return undefined;
    return `binary exited ${String(run.status)}: ${(run.stderr || run.stdout).trim()}`;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function check(entry: Expectation): Promise<void> {
  const file = join(PARALLEL, entry.test);
  if (!existsSync(file)) {
    throw new Error(`${file} is missing: run \`node packages/tests/node-suite/fetch.ts\``);
  }
  const host = await runProcess(nodePath(), ['--import', HOOK, file], {
    env: PINNED_ENV,
    cwd: CORPUS,
  });
  if (host.status !== 0) {
    throw new Error(
      `fails under the pinned Node (exit ${String(host.status)}), so it is a skip, not a ${entry.expect}:\n${host.stderr}`,
    );
  }
  const failure = await statorFailure(file);
  if (entry.expect === 'pass' && failure !== undefined) {
    throw new Error(`expected to pass, failed: ${failure}`);
  }
  if (entry.expect === 'fail' && failure === undefined) {
    throw new Error('expected to fail, now passes: flip it to "pass" in expectations.json');
  }
  tally[entry.expect]++;
}

describe(`Node ${tag} test/parallel`, () => {
  for (const entry of selection) {
    const label = `${entry.test} (${entry.expect}${entry.reason !== undefined ? `: ${entry.reason}` : ''})`;
    if (entry.expect === 'skip') {
      tally.skip++;
      test.skip(label, () => {});
    } else {
      test(label, () => check(entry));
    }
  }
  afterAll(() => {
    console.log(
      `node-suite: ${String(selection.length)} selected at ${tag} — ${String(tally.pass)} passed, ${String(tally.fail)} expected-fail, ${String(tally.skip)} skipped`,
    );
  });
});
