/* console.log's util.format placeholders (plan.md §9 Task 6.24, QA audit F13).
 *
 * The goldens (`golden/ts/console_format.ts`, `golden/js/console_format.js`) hold every
 * specifier to the pinned Node byte-for-byte. What they cannot hold is the refusal a format only
 * the run sees: the gate cannot read a format string that is not a literal, so the runtime aborts
 * loudly (STA2005) where it would otherwise print something Node does not. */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { NATIVE_ONLY, compileAndRunStreams } from './helpers.ts';

test('console.log applies format specifiers like Node', NATIVE_ONLY, () => {
  const { stdout } = compileAndRunStreams("console.log('%s=%d', 'n', 5);\n", 'format');
  assert.equal(stdout, 'n=5\n');
});

test(
  'a run-time format meeting a placeholder it cannot print aborts with STA2005',
  NATIVE_ONLY,
  () => {
    const cli = fileURLToPath(new URL('../../compiler/src/cli/main.ts', import.meta.url));
    const dir = mkdtempSync(join(tmpdir(), 'stator-format-refusal-'));
    try {
      const entry = join(dir, 'main.ts');
      const out = join(dir, 'main');
      // `string`, not the literal type: the checker cannot see the `%o`, so the gate admits it.
      writeFileSync(entry, "let format: string = '%o';\nconsole.log(format, { a: 1 });\n");
      const build = spawnSync(process.execPath, [cli, 'build', entry, '-o', out], {
        encoding: 'utf8',
      });
      assert.equal(build.status, 0, `${build.stdout}${build.stderr}`);
      const run = spawnSync(out, [], { encoding: 'utf8' });
      assert.notEqual(run.status, 0);
      assert.equal(run.stdout, '');
      assert.match(run.stderr, /STA2005: console\.log %o of an object is not yet supported/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
