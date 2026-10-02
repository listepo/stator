/* The test-impact selector (plan.md §9 Task 6.17): synthetic maps and diffs, one per rule.
 *
 * The selector is a pure function of (map, diff, current tests), so every rule is pinned here
 * without recording anything: a type-only edit selects nothing, a function-body edit selects the
 * tests that executed that function, a module-scope edit the tests that loaded the file, and
 * every reason the map cannot be trusted falls back to the full suite with that reason.
 */

import { strict as assert } from 'node:assert';
import { describe, test } from 'vitest';
import {
  HARNESSES,
  MAP_SCHEMA,
  decodeBits,
  encodeBits,
  fullSelection,
  mapFallbackReason,
  parseMap,
  parseUnifiedDiff,
  select,
  type FileChange,
  type HarnessName,
  type HarnessRecord,
  type Hunk,
  type ImpactMap,
  type Selection,
  type TestRecord,
} from '../support/impact.ts';

const A = 'packages/compiler/src/a.ts';
const B = 'packages/compiler/src/b.ts';
const C = 'packages/compiler/src/c.ts';

/* Lines: 1 import · 2 TABLE · 4–6 alpha · 8–10 beta · 12 gamma = init() · 13–15 init (load time). */
const SOURCE = `import { helper } from './b.ts';
export const TABLE = [1, 2, 3];

export function alpha(x: number): number {
  return x + helper(1);
}

export function beta(x: number): number {
  return x * 2;
}

export const gamma = init();
function init(): number {
  return 3;
}
`;

const ALPHA = 0;
const BETA = 1;
const INIT = 2;
const A_FILE = {
  fns: [
    [4, 6],
    [8, 10],
    [13, 15],
  ],
  loadTime: [INIT],
} as const;

const T1 = 'packages/tests/unit/t1.test.ts';
const T2 = 'packages/tests/unit/t2.test.ts';
const T3 = 'packages/tests/unit/t3.test.ts';

function unitTest(fns: readonly number[], loaded: readonly string[], reads?: string[]): TestRecord {
  return {
    fns: fns.length > 0 ? { [A]: encodeBits(fns, A_FILE.fns.length) } : {},
    loaded,
    ...(reads === undefined ? {} : { reads }),
  };
}

/** Unit is per-process: each test records what it loaded. */
const UNIT: HarnessRecord = {
  files: { [A]: A_FILE },
  loaded: [],
  reads: [],
  tests: {
    [T1]: unitTest([ALPHA, INIT], [A, B]),
    [T2]: unitTest([BETA, INIT], [A, B]),
    [T3]: unitTest([], [C], ['packages/tests/unit/data/table.json']),
  },
};

/** Subset is in-process: the harness loaded `a.ts` once for every fixture. */
const SUBSET: HarnessRecord = {
  files: { [A]: A_FILE },
  loaded: [A, B],
  reads: [],
  tests: {
    subset_one: { fns: { [A]: encodeBits([ALPHA], A_FILE.fns.length) } },
    subset_two: { fns: {} },
  },
};

const GOLDEN: HarnessRecord = {
  files: {},
  loaded: [],
  reads: [],
  tests: {
    'ts/dates.ts': {
      fns: {},
      native: ['packages/runtime/include/jsrt.h', 'packages/runtime/src/jsrt_date.c'],
    },
    'ts/strings.ts': {
      fns: {},
      native: ['packages/runtime/include/jsrt.h', 'packages/runtime/src/jsrt_string.c'],
    },
  },
};

const MAP: ImpactMap = {
  schema: MAP_SCHEMA,
  commit: 'c0ffee',
  dirty: false,
  node: 'v26.7.0',
  platform: 'darwin-arm64',
  recordedAt: '2026-01-01T00:00:00.000Z',
  harnesses: {
    unit: UNIT,
    subset: SUBSET,
    golden: GOLDEN,
    runtime: { files: {}, loaded: [], reads: [], tests: { runtime: { fns: {}, native: ['*'] } } },
  },
};

const CURRENT: Record<HarnessName, readonly string[]> = {
  unit: [T1, T2, T3],
  subset: ['subset_one', 'subset_two'],
  golden: ['ts/dates.ts', 'ts/strings.ts'],
  asan: [],
  runtime: ['runtime'],
  leak: [],
  ffi: [],
  builtins: [],
  'node-coverage': [],
};

/** The single `-U0` hunk between two texts that differ in one region (git's numbering). */
function hunkOf(oldText: string, newText: string): Hunk {
  const before = oldText.split('\n');
  const after = newText.split('\n');
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const oldCount = before.length - prefix - suffix;
  const newCount = after.length - prefix - suffix;
  return {
    oldStart: oldCount === 0 ? prefix : prefix + 1,
    oldCount,
    newStart: newCount === 0 ? prefix : prefix + 1,
    newCount,
  };
}

function edit(path: string, from: string, to: string): FileChange {
  const newText = SOURCE.replace(from, to);
  assert.notEqual(newText, SOURCE, `the edit "${from}" must apply`);
  return { path, status: 'modified', oldText: SOURCE, newText, hunks: [hunkOf(SOURCE, newText)] };
}

function picked(selection: Selection, harness: HarnessName): readonly string[] {
  const entry = selection.harnesses.find((candidate) => candidate.harness === harness);
  assert.ok(entry !== undefined, `no ${harness} entry`);
  return entry.keys;
}

function run(...changes: FileChange[]): Selection {
  return select({ map: MAP, changes, current: CURRENT });
}

function selectedCount(selection: Selection): number {
  return selection.harnesses.reduce(
    (sum, entry) => sum + (entry.harness === 'runtime' ? 0 : entry.keys.length),
    0,
  );
}

describe('impact selector: TypeScript edits', () => {
  test('a type-only edit selects nothing', () => {
    const selection = run(edit(A, 'beta(x: number): number', 'beta(x: number): number | never'));
    assert.equal(selectedCount(selection), 0);
    assert.deepEqual(picked(selection, 'runtime'), []);
  });

  test('an edit inside a function selects only the tests that executed it', () => {
    const selection = run(edit(A, 'return x * 2;', 'return x * 3;'));
    assert.deepEqual(picked(selection, 'unit'), [T2]);
    assert.deepEqual(picked(selection, 'subset'), []);
    assert.deepEqual(picked(selection, 'golden'), []);
  });

  test('an edit at module scope selects the tests that loaded the file', () => {
    const selection = run(edit(A, '[1, 2, 3]', '[1, 2, 4]'));
    assert.deepEqual(picked(selection, 'unit'), [T1, T2]);
    // In-process: the harness itself loaded `a.ts`, so every fixture reran.
    assert.deepEqual(picked(selection, 'subset'), ['subset_one', 'subset_two']);
  });

  test('an edit inside a function that ran at load time is a module-scope edit', () => {
    const selection = run(edit(A, 'return 3;', 'return 4;'));
    assert.deepEqual(picked(selection, 'unit'), [T1, T2]);
    assert.deepEqual(picked(selection, 'subset'), ['subset_one', 'subset_two']);
  });

  test('a new helper function selects nothing until something calls it', () => {
    const selection = run(
      edit(
        A,
        '}\n\nexport function beta',
        '}\n\nfunction delta(): number {\n  return 1;\n}\n\nexport function beta',
      ),
    );
    assert.equal(selectedCount(selection), 0);
  });

  test('importing a module every loader already loaded selects nothing', () => {
    const selection = run(edit(A, "'./b.ts';\n", "'./b.ts';\nimport { other } from './b.ts';\n"));
    assert.equal(selectedCount(selection), 0);
  });

  test('importing a module not loaded before selects the tests that load the importer', () => {
    const selection = run(edit(A, "'./b.ts';\n", "'./b.ts';\nimport { other } from './d.ts';\n"));
    assert.deepEqual(picked(selection, 'unit'), [T1, T2]);
  });

  test('removing an exported name is a module-scope edit', () => {
    const selection = run(edit(A, 'export const gamma', 'const gamma'));
    assert.deepEqual(picked(selection, 'unit'), [T1, T2]);
  });

  test('a data file selects only the tests that read it', () => {
    const selection = run({
      path: 'packages/tests/unit/data/table.json',
      status: 'modified',
      hunks: [],
    });
    assert.deepEqual(picked(selection, 'unit'), [T3]);
  });
});

describe('impact selector: runtime and whole-run triggers', () => {
  const native = (path: string): FileChange => ({ path, status: 'modified', hunks: [] });

  test('a runtime .c edit selects only the tests whose binaries linked it', () => {
    const selection = run(native('packages/runtime/src/jsrt_date.c'));
    assert.deepEqual(picked(selection, 'golden'), ['ts/dates.ts']);
    assert.deepEqual(picked(selection, 'unit'), []);
    assert.deepEqual(picked(selection, 'runtime'), ['runtime']);
  });

  test('a public header edit selects every test that links the runtime', () => {
    const selection = run(native('packages/runtime/include/jsrt.h'));
    assert.deepEqual(picked(selection, 'golden'), ['ts/dates.ts', 'ts/strings.ts']);
    assert.deepEqual(picked(selection, 'subset'), []);
  });

  test('the lockfile selects everything', () => {
    const selection = run(native('pnpm-lock.yaml'));
    for (const harness of HARNESSES) {
      const entry = selection.harnesses.find((candidate) => candidate.harness === harness);
      assert.ok(entry?.all === true, `${harness} must run whole`);
    }
  });

  test('docs select nothing', () => {
    assert.equal(selectedCount(run(native('docs/SUBSET.md'))), 0);
  });

  test('a new test always runs', () => {
    const selection = select({
      map: MAP,
      changes: [],
      current: { ...CURRENT, unit: [...CURRENT.unit, 'packages/tests/unit/t4.test.ts'] },
    });
    assert.deepEqual(picked(selection, 'unit'), ['packages/tests/unit/t4.test.ts']);
  });
});

describe('impact selector: map trust', () => {
  const context = { node: MAP.node, platform: MAP.platform, commitIsAncestor: true };

  test('a usable map has no fallback reason', () => {
    assert.equal(mapFallbackReason(MAP, context), undefined);
  });

  test('an unknown map commit falls back to the full suite and says why', () => {
    const reason = mapFallbackReason(MAP, { ...context, commitIsAncestor: false });
    assert.ok(reason !== undefined && reason.includes(MAP.commit));
    const selection = fullSelection(CURRENT, reason);
    assert.equal(selection.fallback, reason);
    assert.deepEqual(picked(selection, 'unit'), [T1, T2, T3]);
  });

  test('another Node, another platform, a dirty recording and another schema fall back', () => {
    assert.ok(mapFallbackReason(MAP, { ...context, node: 'v24.0.0' })?.includes('v24.0.0'));
    assert.ok(mapFallbackReason(MAP, { ...context, platform: 'linux-x64' }) !== undefined);
    assert.ok(mapFallbackReason({ ...MAP, dirty: true }, context) !== undefined);
    assert.ok(mapFallbackReason({ ...MAP, schema: MAP_SCHEMA + 1 }, context) !== undefined);
  });

  test('parseMap round-trips a map and rejects garbage', () => {
    assert.deepEqual(parseMap(JSON.parse(JSON.stringify(MAP))), MAP);
    assert.throws(() => parseMap({ schema: MAP_SCHEMA }));
  });
});

describe('impact selector: encodings', () => {
  test('bitsets round-trip', () => {
    const bits = encodeBits([0, 3, 9, 17], 20);
    assert.deepEqual(
      [...decodeBits(bits)].sort((a, b) => a - b),
      [0, 3, 9, 17],
    );
  });

  test('unified diffs parse into hunks per new path', () => {
    const patch = [
      `diff --git a/${A} b/${A}`,
      `--- a/${A}`,
      `+++ b/${A}`,
      '@@ -5 +5 @@ export function alpha(x: number): number {',
      '-  return x + helper(1);',
      '+  return x + helper(2);',
      '@@ -12,0 +13,2 @@',
      '+// one',
      '+// two',
      `diff --git a/${C} b/${C}`,
      'deleted file mode 100644',
      `--- a/${C}`,
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-a',
      '-b',
      '',
    ].join('\n');
    const hunks = parseUnifiedDiff(patch);
    assert.deepEqual(hunks.get(A), [
      { oldStart: 5, oldCount: 1, newStart: 5, newCount: 1 },
      { oldStart: 12, oldCount: 0, newStart: 13, newCount: 2 },
    ]);
    assert.deepEqual(hunks.get(C), [{ oldStart: 1, oldCount: 2, newStart: 0, newCount: 0 }]);
  });
});
