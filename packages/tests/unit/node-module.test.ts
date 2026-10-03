/* `node:module` (plan.md §11c T11.5): the `require` it makes answers every landed built-in, and
 * its `builtinModules` is the pinned Node's. The run-time behavior is the `node_module` goldens'. */

import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';

const SOURCE = fileURLToPath(new URL('../../node/src/', import.meta.url));
const MODULE = readFileSync(`${SOURCE}module.ts`, 'utf8');

/** Every built-in `packages/node` has landed, by id: `path.ts` is `path`, `path/posix.ts` is
 * `path/posix`. `internal/` and declaration files are not modules. */
function landedIds(): string[] {
  return readdirSync(SOURCE, { recursive: true, encoding: 'utf8' })
    .map((file) => file.replace(/\\/g, '/'))
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
    .filter((file) => !file.startsWith('internal/'))
    .map((file) => file.slice(0, -'.ts'.length))
    .sort();
}

test('require answers every landed built-in', () => {
  const ids = landedIds();
  assert.ok(ids.includes('path') && ids.includes('module'), ids.join(', '));
  for (const id of ids) {
    assert.ok(MODULE.includes(`case '${id}':`), `module.ts's landed table misses '${id}'`);
  }
});

test("builtinModules is the pinned Node's", () => {
  const start = MODULE.indexOf('export const builtinModules');
  const end = MODULE.indexOf('];', start);
  const listed = [...MODULE.slice(start, end).matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(listed, builtinModules);
});
