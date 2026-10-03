/* The node-suite harness prints values without `node:util` (plan.md §11c T11.7, N2):
 * `common/inspect.ts` must answer what the pinned Node's `util.inspect` answers for every value
 * it claims to cover. */

import { strict as assert } from 'node:assert';
import { inspect } from 'node:util';
import { test } from 'vitest';
import { invalidArgTypeHelper } from '../node-suite/common/index.ts';
import { inspectValue } from '../node-suite/common/inspect.ts';

const PRIMITIVES: readonly unknown[] = [
  null,
  undefined,
  true,
  false,
  0,
  -0,
  1.5,
  1e21,
  Number.NaN,
  -Infinity,
  12n,
  Symbol('s'),
  '',
  'string',
  "it's",
  'say "hi"',
  'both \' and "',
  'all \' " ` three',
  'tab\there\nnew\x00\x1f\x7f back\\slash',
];

test('inspectValue prints primitives as util.inspect does', () => {
  for (const value of PRIMITIVES) {
    assert.equal(inspectValue(value), inspect(value), String(value));
  }
});

test('inspectValue prints an object as depth -1 does', () => {
  const values: readonly unknown[] = [
    Object.create(null),
    {},
    { a: 1 },
    [],
    [1],
    new Map([[1, 2]]),
    () => 1,
    parseInt,
  ];
  for (const value of values) {
    assert.equal(inspectValue(value), inspect(value, { depth: -1 }));
  }
  const keyed = Object.assign(Object.create(null) as object, { k: 1 });
  assert.equal(inspectValue(keyed), inspect(keyed, { depth: -1 }));
});

test("invalidArgTypeHelper's tail is Node's for the selection's inputs", () => {
  assert.equal(invalidArgTypeHelper('string'), " Received type string ('string')");
  assert.equal(invalidArgTypeHelper(1), ' Received type number (1)');
  assert.equal(invalidArgTypeHelper(true), ' Received type boolean (true)');
  assert.equal(invalidArgTypeHelper(null), ' Received null');
  assert.equal(invalidArgTypeHelper(Object.create(null)), ' Received [Object: null prototype] {}');
});
