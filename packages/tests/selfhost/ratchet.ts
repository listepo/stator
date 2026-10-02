/* The self-compilation ratchet's logic (plan.md §9 Task 6.19): the target list, the tally of one
 * `explain --json` report, and the comparison against the committed baseline. `run.ts` spawns the
 * compiler; everything that decides pass or fail is here, so the unit tests exercise it directly.
 *
 * Invariant: a count may only shrink, a code may only disappear, a verdict may only improve.
 * A shrink also fails until `--update` records it, so the slack can never hide a later regression.
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Verdict } from '../../compiler/src/cli/explain.ts';

/** Lower is better. */
const VERDICT_RANK: Readonly<Record<Verdict, number>> = {
  static: 0,
  dynamic: 1,
  'not-yet': 2,
  error: 3,
};

export type Smoke = 'stage2' | 'std-goldens';

export interface TargetSpec {
  /** Repo-relative package directory, e.g. `packages/std`. */
  readonly package: string;
  /** A directory (relative to the package) whose `*.ts` files are each a target. Absent: the
   * package's `stator.config.json` names the one entry. */
  readonly entries?: string;
  readonly smoke: Smoke;
}

export interface TargetList {
  readonly targets: readonly TargetSpec[];
  /** Package directory → why Stator does not compile it. */
  readonly notTargets: Readonly<Record<string, string>>;
}

export interface TargetResult {
  readonly verdict: Verdict;
  /** Diagnostic code → count, keys sorted. */
  readonly codes: Readonly<Record<string, number>>;
}

/** Target name (package dir, or package dir + `/` + entry) → result. */
export type Baseline = Readonly<Record<string, TargetResult>>;

export interface Comparison {
  /** Growth: a raised count, a new code, a worse verdict or an unrecorded target. */
  readonly regressions: readonly string[];
  /** Shrinkage not yet recorded: fails until `--update` rewrites the baseline. */
  readonly improvements: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVerdict(value: unknown): value is Verdict {
  return value === 'static' || value === 'dynamic' || value === 'not-yet' || value === 'error';
}

function isSmoke(value: unknown): value is Smoke {
  return value === 'stage2' || value === 'std-goldens';
}

function sortedCodes(codes: Readonly<Record<string, number>>): Record<string, number> {
  const sorted: Record<string, number> = {};
  for (const code of Object.keys(codes).sort()) {
    const count = codes[code];
    if (count !== undefined) sorted[code] = count;
  }
  return sorted;
}

/** Parse `targets.json`. Throws on any shape error: a malformed list must not pass as empty. */
export function parseTargetList(value: unknown): TargetList {
  if (!isRecord(value) || !Array.isArray(value['targets']) || !isRecord(value['notTargets'])) {
    throw new Error('targets.json: expected { targets: [...], notTargets: {...} }');
  }
  const targets: TargetSpec[] = [];
  for (const raw of value['targets']) {
    const item: unknown = raw;
    if (!isRecord(item) || typeof item['package'] !== 'string' || !isSmoke(item['smoke'])) {
      throw new Error(`targets.json: bad target ${JSON.stringify(item)}`);
    }
    const entries = item['entries'];
    if (entries !== undefined && typeof entries !== 'string') {
      throw new Error(`targets.json: entries of ${item['package']} must be a string`);
    }
    targets.push({
      package: item['package'],
      smoke: item['smoke'],
      ...(entries === undefined ? {} : { entries }),
    });
  }
  const notTargets: Record<string, string> = {};
  for (const [dir, why] of Object.entries(value['notTargets'])) {
    if (typeof why !== 'string' || why.trim() === '') {
      throw new Error(`targets.json: notTargets.${dir} needs a reason`);
    }
    notTargets[dir] = why;
  }
  return { targets, notTargets };
}

/** The repo's packages as repo-relative paths (`packages/std`), sorted: the set `checkCoverage`
 * holds the target list against. */
export function packageDirs(repo: string): string[] {
  const root = join(repo, 'packages');
  return readdirSync(root)
    .filter((name) => statSync(join(root, name)).isDirectory())
    .map((name) => `packages/${name}`)
    .sort();
}

/** Every directory under `packages/` must be a target or a listed non-target, and every listed
 * one must exist. Returns one message per violation. */
export function checkCoverage(list: TargetList, dirs: readonly string[]): string[] {
  const problems: string[] = [];
  const targets = new Set(list.targets.map((target) => target.package));
  const present = new Set(dirs);
  for (const dir of dirs) {
    const listed = targets.has(dir);
    const excluded = Object.hasOwn(list.notTargets, dir);
    if (listed && excluded) problems.push(`${dir} is both a target and not a target`);
    if (!listed && !excluded) {
      problems.push(
        `${dir} is neither a self-compilation target nor marked "not a target" in selfhost/targets.json`,
      );
    }
  }
  for (const dir of [...targets, ...Object.keys(list.notTargets)]) {
    if (!present.has(dir)) problems.push(`${dir} is listed in selfhost/targets.json but missing`);
  }
  return problems;
}

/** Tally one `stator explain --json` report: its verdict and the deciding stage's diagnostics
 * counted by code (plan-notes 291). */
export function tally(report: unknown): TargetResult {
  if (!isRecord(report) || !isVerdict(report['verdict'])) {
    throw new Error(`explain --json: expected a verdict, got ${JSON.stringify(report)}`);
  }
  const codes: Record<string, number> = {};
  const diagnostics: unknown = report['diagnostics'] ?? [];
  if (!Array.isArray(diagnostics)) throw new Error('explain --json: diagnostics is not an array');
  for (const raw of diagnostics) {
    const diagnostic: unknown = raw;
    if (!isRecord(diagnostic) || typeof diagnostic['code'] !== 'string') {
      throw new Error(`explain --json: diagnostic without a code: ${JSON.stringify(diagnostic)}`);
    }
    const code = diagnostic['code'];
    codes[code] = (codes[code] ?? 0) + 1;
  }
  return { verdict: report['verdict'], codes: sortedCodes(codes) };
}

/** Parse `baseline.json`. */
export function parseBaseline(value: unknown): Baseline {
  if (!isRecord(value)) throw new Error('baseline.json: expected an object');
  const baseline: Record<string, TargetResult> = {};
  for (const [name, raw] of Object.entries(value)) {
    const entry: unknown = raw;
    if (!isRecord(entry) || !isVerdict(entry['verdict']) || !isRecord(entry['codes'])) {
      throw new Error(`baseline.json: bad entry ${name}`);
    }
    const codes: Record<string, number> = {};
    for (const [code, count] of Object.entries(entry['codes'])) {
      if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0) {
        throw new Error(`baseline.json: ${name}.${code} must be a positive integer`);
      }
      codes[code] = count;
    }
    baseline[name] = { verdict: entry['verdict'], codes };
  }
  return baseline;
}

/** The baseline as written by `--update`: targets and codes sorted, so diffs stay minimal. */
export function formatBaseline(measured: Baseline): string {
  const ordered: Record<string, TargetResult> = {};
  for (const name of Object.keys(measured).sort()) {
    const result = measured[name];
    if (result !== undefined) {
      ordered[name] = { verdict: result.verdict, codes: sortedCodes(result.codes) };
    }
  }
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export function compare(baseline: Baseline, measured: Baseline): Comparison {
  const regressions: string[] = [];
  const improvements: string[] = [];
  for (const [name, now] of Object.entries(measured)) {
    const before = baseline[name];
    if (before === undefined) {
      regressions.push(`${name}: new target, not in the baseline (record it with --update)`);
      continue;
    }
    const rankNow = VERDICT_RANK[now.verdict];
    const rankBefore = VERDICT_RANK[before.verdict];
    if (rankNow > rankBefore) {
      regressions.push(`${name}: verdict ${before.verdict} -> ${now.verdict}`);
    } else if (rankNow < rankBefore) {
      improvements.push(`${name}: verdict ${before.verdict} -> ${now.verdict}`);
    }
    for (const code of Object.keys({ ...before.codes, ...now.codes }).sort()) {
      const was = before.codes[code] ?? 0;
      const is = now.codes[code] ?? 0;
      if (is > was) regressions.push(`${name}: ${code} ${String(was)} -> ${String(is)}`);
      if (is < was) improvements.push(`${name}: ${code} ${String(was)} -> ${String(is)}`);
    }
  }
  for (const name of Object.keys(baseline)) {
    if (!Object.hasOwn(measured, name)) {
      improvements.push(`${name}: no longer a target (drop it with --update)`);
    }
  }
  return { regressions, improvements };
}
