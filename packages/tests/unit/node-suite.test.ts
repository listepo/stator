/* Node's own test suite, the parts that need no network (plan.md §11c T11.7): the pin follows
 * `.node-version`, expectations.json is well-formed, a test file maps to its module, and the
 * strict-TS `common` answers what Node's own `common` answers. */

import { strict as assert } from 'node:assert';
import { builtinModules } from 'node:module';
import { join } from 'node:path';
import { test } from 'vitest';
import { invalidArgTypeHelper } from '../node-suite/common/index.ts';
import { loadExpectations, loadPin, moduleOf } from '../node-suite/suite.ts';

const IDS = [...new Set(builtinModules.map((id) => id.replace(/^node:/, '')))];

test('the pin names the Node in .node-version', () => {
  assert.equal(loadPin().repository, 'https://github.com/nodejs/node');
});

test('every selected test belongs to a built-in module and says why it does not pass', () => {
  const selection = loadExpectations();
  assert.ok(selection.length > 0);
  for (const entry of selection) {
    assert.notEqual(moduleOf(entry.test, IDS), undefined, entry.test);
    if (entry.expect !== 'pass') assert.ok(entry.reason !== undefined, entry.test);
  }
});

test('a test file maps to the longest module its name starts with', () => {
  assert.equal(moduleOf('test-path.js', IDS), 'path');
  assert.equal(moduleOf('test-path-join.js', IDS), 'path');
  assert.equal(moduleOf('test-path-posix-exists.js', IDS), 'path/posix');
  assert.equal(moduleOf('test-perf-hooks-usertiming.js', IDS), 'perf_hooks');
  assert.equal(moduleOf('test-pathological.js', IDS), undefined);
});

test("invalidArgTypeHelper matches the tail of Node's own ERR_INVALID_ARG_TYPE", () => {
  for (const input of [1, true, null, undefined, 10n, Symbol('s'), {}, [], (): void => {}]) {
    let message = '';
    try {
      // @ts-expect-error -- the wrong argument type is the point
      join(input);
    } catch (error) {
      if (error instanceof Error) message = error.message;
    }
    assert.ok(message.endsWith(invalidArgTypeHelper(input)), `${message} / ${typeof input}`);
  }
});
