/* Decision-test runner (plan.md §4 Task 1.4).
 *
 * Each fixture is tests/subset/subset_<feature>_<mode>.ts|.js with first-line directives:
 *   // @mode: ts|js
 *   // @verdict: static | dynamic | error | not-yet
 *   // @code: STA1101          (required for error/not-yet)
 *   // @expected-fail: true    (pre-implementation; reported, never hidden)
 *
 * Verdicts come from `stator explain --json`. Fixtures marked expected-fail are not
 * executed — they are counted, so the corpus can land before the compiler can pass it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, runProcess } from '../support/parallel.ts';

type Verdict = 'static' | 'dynamic' | 'error' | 'not-yet';

interface Directives {
  mode: 'ts' | 'js';
  verdict: Verdict;
  code?: string;
  expectedFail: boolean;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const CLI = join(REPO, 'src', 'cli', 'main.ts');

const VERDICTS: readonly string[] = ['static', 'dynamic', 'error', 'not-yet'];

/* Codes allocated by docs/DIAGNOSTICS.md, which plan §4 Task 1.3 makes the sole allocator.
 * Everything below the "Retired codes" heading is deliberately excluded: a retired code appears
 * in that file precisely so it is never used again. This check runs on expected-fail fixtures
 * too — they are the ones nothing else looks at, so an invented code would otherwise sit
 * unnoticed until the phase that implements the feature. */
function allocatedCodes(): ReadonlySet<string> {
  const table = readFileSync(join(REPO, 'docs', 'DIAGNOSTICS.md'), 'utf8');
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
  const result = await runProcess(process.execPath, [
    CLI,
    'explain',
    file,
    `--mode=${mode}`,
    '--json',
  ]);
  if (result.status !== 0) {
    throw new Error(`stator explain failed (${String(result.status)}): ${result.stderr.trim()}`);
  }
  const parsed: unknown = JSON.parse(result.stdout);
  if (typeof parsed !== 'object' || parsed === null || !('verdict' in parsed)) {
    throw new Error(`stator explain --json returned no "verdict": ${result.stdout.trim()}`);
  }
  const { verdict } = parsed;
  if (typeof verdict !== 'string') {
    throw new Error('stator explain --json: "verdict" is not a string');
  }
  const code = 'code' in parsed && typeof parsed.code === 'string' ? parsed.code : undefined;
  return code === undefined ? { verdict } : { verdict, code };
}

async function main(): Promise<void> {
  const fixtures = readdirSync(HERE)
    .filter((name) => name.startsWith('subset_'))
    .sort();

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
  process.stdout.write(
    `subset: ${String(fixtures.length)} fixtures — ${String(passed)} passed, ` +
      `${String(expectedFail)} expected-fail, ${String(failures.length)} failed\n`,
  );
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

await main();
