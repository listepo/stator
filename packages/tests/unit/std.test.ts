/* plan.md §11c T11.2: the `std/*` package below the goldens.
 *
 * The goldens prove what a std call prints; this file pins what they cannot see — that the std
 * archive joins the link line only for a program whose module graph holds a std module (the
 * Check's "a program without `std/*` imports links no `libjsrt_std.a`"), and the two process
 * exits a golden cannot run because the golden runner demands status 0: a non-zero `exit` and
 * `abort`. */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { compileToC, linkArguments } from '../../compiler/src/cli/build.ts';
import { NATIVE_ONLY } from './helpers.ts';

const CLI = fileURLToPath(new URL('../../compiler/src/cli/main.ts', import.meta.url));

function withProgram<T>(source: string, body: (entry: string, dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'stator-std-'));
  try {
    const entry = join(dir, 'main.ts');
    writeFileSync(entry, source);
    return body(entry, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Build `source` and run the binary, handing back how it ended. */
function buildAndRun(source: string): ReturnType<typeof spawnSync> & { stdout: string } {
  return withProgram(source, (entry, dir) => {
    const out = join(dir, 'main');
    const build = spawnSync(process.execPath, [CLI, 'build', entry, '-o', out], {
      encoding: 'utf8',
    });
    assert.equal(build.status, 0, `build failed:\n${build.stdout}${build.stderr}`);
    return spawnSync(out, [], { encoding: 'utf8' });
  });
}

test('the link line names libjsrt_std.a only when asked to', () => {
  const plain = linkArguments('main.c', 'main', 2, [], false);
  const std = linkArguments('main.c', 'main', 2, [], true);
  assert.equal(plain.filter((arg) => arg.endsWith('libjsrt_std.a')).length, 0);
  const archives = std.filter((arg) => arg.endsWith('libjsrt_std.a'));
  assert.equal(archives.length, 1);
  // Before `-ljsrt`: a static archive only satisfies references the objects before it made.
  const archive = archives[0] ?? '';
  assert.ok(std.indexOf(archive) < std.indexOf('-ljsrt'), 'std archive precedes the runtime');
  assert.deepEqual(
    std.filter((arg) => arg !== archive),
    plain,
    'the archive is the only difference',
  );
});

async function compiledStd(source: string): Promise<boolean> {
  const dir = mkdtempSync(join(tmpdir(), 'stator-std-'));
  try {
    const entry = join(dir, 'main.ts');
    writeFileSync(entry, source);
    const compiled = await compileToC(entry, 'ts');
    assert.ok(compiled !== null, 'the program compiles');
    return compiled.std;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a std importer is a std link; a program without std imports is not', async () => {
  assert.equal(
    await compiledStd('import { join } from "std/path";\nconsole.log(join("a", "b"));\n'),
    true,
  );
  assert.equal(await compiledStd('console.log("no std");\n'), false);
});

test('std/process exit ends the program with its code, after what was printed', NATIVE_ONLY, () => {
  const run = buildAndRun(
    'import { exit } from "std/process";\nconsole.log("before");\nexit(3);\nconsole.log("after");\n',
  );
  assert.equal(run.status, 3);
  assert.equal(run.stdout, 'before\n');
});

test('std/process abort ends the program with SIGABRT', NATIVE_ONLY, () => {
  const run = buildAndRun(
    'import { abort } from "std/process";\nconsole.log("before");\nabort();\n',
  );
  assert.equal(run.signal, 'SIGABRT');
  assert.equal(run.status, null);
});
