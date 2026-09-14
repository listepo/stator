/* The `explain --json` unchecked-boundary mark (docs/FFI.md section 5).
 *
 * `externCallsField` rides ALONGSIDE the verdict: present with one row per compiled extern
 * call (the C symbol, not the TS name), absent — not empty — otherwise, and never on a
 * refused program (a call that does not compile is a refusal, not a boundary).
 */

import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { explainFile } from '../../compiler/src/cli/explain.ts';

/** A scratch program of entry + `.d.ts` helper: the only placement the gate accepts. */
function writeProgram(
  files: Readonly<Record<string, string>>,
  entryName = 'main.ts',
): {
  work: string;
  entry: string;
} {
  const work = mkdtempSync(join(tmpdir(), 'stator-extern-explain-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(work, name), content);
  }
  return { work, entry: join(work, entryName) };
}

const HELPER =
  'type CString = string & { readonly __statorCstr: "CString" };\n' +
  '/** @statorExtern */\ndeclare function extSqrt(x: number): number;\n' +
  '/** @statorExtern c_atof */\ndeclare function extAtof(s: CString): number;\n';

void test('a module with an extern call reports the C symbol and line', async () => {
  const { work, entry } = writeProgram({
    'main.ts':
      '/// <reference path="./helper.d.ts" />\n' +
      'console.log(extSqrt(4));\n' +
      'console.log(extAtof("3.5" as CString));\n' +
      'export {};\n',
    'helper.d.ts': HELPER,
  });
  try {
    const result = await explainFile(entry, 'ts');
    assert.equal(result.verdict, 'static');
    assert.deepEqual(result.externCalls, [
      { name: 'extSqrt', line: 2 },
      // The audit names the FOREIGN code that runs, so the override renames the row.
      { name: 'c_atof', line: 3 },
    ]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

void test('a module without extern calls carries no externCalls key', async () => {
  const { work, entry } = writeProgram({
    'main.ts': 'console.log(40 + 2);\nexport {};\n',
  });
  try {
    const result = await explainFile(entry, 'ts');
    assert.equal(result.verdict, 'static');
    // Absent, not empty: every existing consumer's byte shape is unchanged.
    assert.equal('externCalls' in result, false);
    assert.ok(!JSON.stringify(result).includes('externCalls'));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

void test('a refused extern program carries verdict and code but no flag', async () => {
  const { work, entry } = writeProgram({
    'main.ts':
      '/// <reference path="./helper.d.ts" />\n' +
      'console.log(cTakeString("hello"));\n' +
      'export {};\n',
    // Bare `string` is never inferred across the boundary (docs/FFI.md section 2).
    'helper.d.ts': '/** @statorExtern */\ndeclare function cTakeString(s: string): number;\n',
  });
  try {
    const result = await explainFile(entry, 'ts');
    assert.deepEqual([result.verdict, result.code], ['error', 'STA1118']);
    assert.equal('externCalls' in result, false);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
