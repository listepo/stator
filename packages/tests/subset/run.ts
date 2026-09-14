/* Decision-test runner (plan.md §4 Task 1.4).
 *
 * Each fixture is tests/subset/subset_<feature>_<mode>.ts|.js with first-line directives:
 *   // @mode: ts|js
 *   // @verdict: static | dynamic | error | not-yet
 *   // @code: STA1101          (required for error/not-yet)
 *   // @expected-fail: true    (pre-implementation; reported, never hidden)
 *
 * Verdicts come from in-process `explainFile` (the same function the `stator explain`
 * CLI prints as `--json`). Fixtures marked expected-fail are not
 * executed — they are counted, so the corpus can land before the compiler can pass it.
 *
 * Usage: node packages/tests/subset/run.ts [--filter <substring> | --filter=<substring>]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { explainFile } from '../../compiler/src/cli/explain.ts';
import { pool } from '../support/parallel.ts';

type Verdict = 'static' | 'dynamic' | 'error' | 'not-yet';

interface Directives {
  mode: 'ts' | 'js';
  verdict: Verdict;
  code?: string;
  expectedFail: boolean;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');

const VERDICTS: readonly string[] = ['static', 'dynamic', 'error', 'not-yet'];

/* Codes allocated by docs/DIAGNOSTICS.md, which plan §4 Task 1.3 makes the sole allocator.
 * Everything below the "Retired codes" heading is deliberately excluded: a retired code appears
 * in that file precisely so it is never used again. This check runs on expected-fail fixtures
 * too — they are the ones nothing else looks at, so an invented code would otherwise sit
 * unnoticed until the phase that implements the feature. */
function allocatedCodes(): ReadonlySet<string> {
  const table = readFileSync(join(REPO, '..', 'docs', 'DIAGNOSTICS.md'), 'utf8');
  const live = table.split('## Retired codes')[0] ?? table;
  return new Set(live.match(/^\| (STA\d{4}) \|/gm)?.map((row) => row.slice(2, 9)) ?? []);
}

function directive(source: string, name: string): string | undefined {
  const match = new RegExp(`^//\\s*@${name}:\\s*(.+)$`, 'm').exec(source);
  return match?.[1]?.trim();
}

function parseDirectives(file: string, source: string): Directives {
  const mode = directive(source, 'mode');
  const verdict = directive(source, 'verdict');
  const code = directive(source, 'code');
  if (mode !== 'ts' && mode !== 'js') {
    throw new Error(`${file}: missing or invalid "// @mode: ts|js"`);
  }
  if (verdict === undefined || !VERDICTS.includes(verdict)) {
    throw new Error(`${file}: missing or invalid "// @verdict: ${VERDICTS.join(' | ')}"`);
  }
  if ((verdict === 'error' || verdict === 'not-yet') && code === undefined) {
    throw new Error(`${file}: "// @code: STAxxxx" is required for verdict "${verdict}"`);
  }
  const parsed: Directives = {
    mode,
    verdict: verdict as Verdict,
    expectedFail: directive(source, 'expected-fail') === 'true',
  };
  return code === undefined ? parsed : { ...parsed, code };
}

async function explain(
  file: string,
  mode: 'ts' | 'js',
): Promise<{ verdict: string; code?: string }> {
  // In-process (plan.md §9 Task 6.6): one `explainFile` call instead of a fresh
  // `node …/cli/main.ts explain --json` spawn per fixture. The `explain` CLI always
  // exits 0 with the verdict as the answer — a refusal is a result, not a throw — and
  // `explainFile` preserves that: rejections come back as a verdict, and only a missing
  // entry throws (which the caller reports per fixture, as the spawn failure was).
  const result = await explainFile(file, mode);
  return result.code === undefined
    ? { verdict: result.verdict }
    : { verdict: result.verdict, code: result.code };
}

/* `--filter` narrows the run to fixtures whose filename contains the substring (developer
 * iteration speed: debug one fixture without running 400+). Both spellings mirror the CLI's
 * dual `--mode` form in packages/compiler/src/cli/main.ts. Filtering happens before pooling,
 * and the summary line reports the filtered totals honestly. A filter that matches nothing is
 * a result, never an error. */
function parseFilter(argv: readonly string[]): string | undefined {
  let filter: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) {
      continue;
    }
    if (arg.startsWith('--filter=')) {
      filter = arg.slice('--filter='.length);
    } else if (arg === '--filter') {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new Error('--filter requires a value (substring)');
      }
      filter = next;
      i += 1;
    } else {
      throw new Error(`unknown flag "${arg}"`);
    }
  }
  return filter;
}

async function main(): Promise<void> {
  const filter = parseFilter(process.argv.slice(2));
  const allFixtures = readdirSync(HERE)
    .filter((name) => name.startsWith('subset_'))
    .sort();
  const fixtures =
    filter === undefined ? allFixtures : allFixtures.filter((name) => name.includes(filter));

  const allocated = allocatedCodes();

  // One outcome per fixture, INDEXED BY FIXTURE: the pool finishes out of order, and a failure list
  // whose order depended on that would differ between two runs of an unchanged tree.
  type Outcome =
    | { readonly kind: 'passed' }
    | { readonly kind: 'expected-fail' }
    | { readonly kind: 'failed'; readonly message: string };

  const outcomes = await pool(fixtures, async (name): Promise<Outcome> => {
    const path = join(HERE, name);
    const want = parseDirectives(name, readFileSync(path, 'utf8'));
    if (want.code !== undefined && !allocated.has(want.code)) {
      return {
        kind: 'failed',
        message: `${name}: @code ${want.code} is not allocated in docs/DIAGNOSTICS.md`,
      };
    }
    // Expected-fail fixtures are still evaluated. A marker that outlives the work it was waiting
    // for is worse than no marker: it silently exempts a fixture that would now hold the line.
    try {
      const got = await explain(path, want.mode);
      const matches =
        got.verdict === want.verdict && (want.code === undefined || got.code === want.code);
      if (want.expectedFail) {
        return matches
          ? { kind: 'failed', message: `${name}: now passes — remove the @expected-fail marker` }
          : { kind: 'expected-fail' };
      }
      if (matches) return { kind: 'passed' };
      return {
        kind: 'failed',
        message:
          got.verdict === want.verdict
            ? `${name}: code ${got.code ?? '(none)'}, want ${want.code ?? '(none)'}`
            : `${name}: verdict ${got.verdict}, want ${want.verdict}`,
      };
    } catch (error) {
      if (want.expectedFail) return { kind: 'expected-fail' };
      return {
        kind: 'failed',
        message: `${name}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  const passed = outcomes.filter((outcome) => outcome.kind === 'passed').length;
  const expectedFail = outcomes.filter((outcome) => outcome.kind === 'expected-fail').length;
  const failures = outcomes
    .filter((outcome) => outcome.kind === 'failed')
    .map((outcome) => outcome.message);

  for (const failure of failures) {
    process.stderr.write(`FAIL ${failure}\n`);
  }
  const scope =
    filter === undefined
      ? `${String(fixtures.length)} fixtures`
      : `${String(fixtures.length)} fixtures (filtered from ${String(allFixtures.length)})`;
  process.stdout.write(
    `subset: ${scope} — ${String(passed)} passed, ` +
      `${String(expectedFail)} expected-fail, ${String(failures.length)} failed\n`,
  );
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

await main();
