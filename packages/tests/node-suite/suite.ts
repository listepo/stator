/* Node's own test suite, the shared half (plan.md §11c T11.7): the pin, the checked-in
 * expectations and where the fetched corpus lives. fetch.ts downloads what this names,
 * node-suite.test.ts runs it, and golden/node-coverage.ts counts it into docs/NODE.md. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const PIN = join(HERE, 'pin.json');
const EXPECTATIONS = join(HERE, 'expectations.json');

/** Where the corpus is fetched to: Node's own `test/` layout, so `../common` and
 * `../fixtures` stay where the tests expect them. Gitignored, never vendored. */
export const CORPUS = process.env['STATOR_NODE_SUITE'] ?? join(HERE, 'corpus');

export interface Pin {
  readonly repository: string;
  readonly tag: string;
}

export type Expect = 'pass' | 'fail' | 'skip';

export interface Expectation {
  /** The file under `test/parallel/`. */
  readonly test: string;
  readonly expect: Expect;
  /** Why it fails or is skipped; required unless it passes. */
  readonly reason?: string;
  /** Files under `test/fixtures/` the test reads, fetched next to it. */
  readonly fixtures: readonly string[];
}

function record(value: unknown, where: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${where}: expected an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function readJson(path: string): unknown {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return parsed;
}

/** The pinned tag, which must name the Node in `.node-version`: the suite is that Node's. */
export function loadPin(): Pin {
  const pin = record(readJson(PIN), PIN);
  const { repository, tag } = pin;
  if (typeof repository !== 'string' || typeof tag !== 'string') {
    throw new Error(`${PIN}: expected {"repository":"<url>","tag":"v<version>"}`);
  }
  const pinned = readFileSync(join(ROOT, '.node-version'), 'utf8').trim().replace(/^v?/, 'v');
  if (tag !== pinned) {
    throw new Error(`${PIN}: tag ${tag} is not .node-version's ${pinned}; re-pin it`);
  }
  return { repository, tag };
}

function isExpect(value: unknown): value is Expect {
  return value === 'pass' || value === 'fail' || value === 'skip';
}

/** Every selected test, in file order. */
export function loadExpectations(): Expectation[] {
  const tests = record(record(readJson(EXPECTATIONS), EXPECTATIONS)['tests'], 'tests');
  return Object.entries(tests).map(([test, raw]): Expectation => {
    const where = `${EXPECTATIONS}: ${test}`;
    const entry = record(raw, where);
    const { expect, reason, fixtures } = entry;
    if (!/^test-[a-z0-9_-]+\.js$/.test(test)) throw new Error(`${where}: not a test-*.js name`);
    if (!isExpect(expect)) throw new Error(`${where}: "expect" must be pass, fail or skip`);
    if (reason !== undefined && typeof reason !== 'string') {
      throw new Error(`${where}: "reason" must be a string`);
    }
    if (expect !== 'pass' && (reason === undefined || reason === '')) {
      throw new Error(`${where}: a ${expect} needs a "reason"`);
    }
    const files = fixtures ?? [];
    if (!Array.isArray(files) || !files.every((file) => typeof file === 'string')) {
      throw new Error(`${where}: "fixtures" must be a list of paths`);
    }
    return {
      test,
      expect,
      fixtures: files,
      ...(reason !== undefined ? { reason } : {}),
    };
  });
}

/** The built-in module a test belongs to: the longest module id whose dashed spelling
 * (`perf_hooks` → `perf-hooks`, `path/posix` → `path-posix`) starts the test's name. */
export function moduleOf(test: string, ids: readonly string[]): string | undefined {
  const name = test.replace(/^test-/, '').replace(/\.js$/, '');
  let best: string | undefined;
  for (const id of ids) {
    const dashed = id.replace(/[/_]/g, '-');
    if ((name === dashed || name.startsWith(`${dashed}-`)) && id.length > (best?.length ?? 0)) {
      best = id;
    }
  }
  return best;
}
