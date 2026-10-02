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

/** `script(1)`'s spelling of "run this command on a fresh pseudo-terminal": BSD/macOS take the
 * command after the transcript file, util-linux takes it as `-c`. */
function underTerminal(binary: string): [string, string[]] {
  return process.platform === 'darwin'
    ? ['script', ['-q', '/dev/null', binary]]
    : ['script', ['-q', '-e', '-c', binary, '/dev/null']];
}

/** Build `source` and run the binary, handing back how it ended: fed `input` on stdin, or on a
 * pseudo-terminal when `terminal` is set. */
function buildAndRun(
  source: string,
  options: { readonly input?: string; readonly terminal?: boolean } = {},
): ReturnType<typeof spawnSync> & { stdout: string } {
  return withProgram(source, (entry, dir) => {
    const out = join(dir, 'main');
    const build = spawnSync(process.execPath, [CLI, 'build', entry, '-o', out], {
      encoding: 'utf8',
    });
    assert.equal(build.status, 0, `build failed:\n${build.stdout}${build.stderr}`);
    if (options.terminal === true) {
      // stdin is /dev/null: BSD `script` refuses a socket there (spawnSync's default pipe).
      const [command, args] = underTerminal(out);
      return spawnSync(command, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
      });
    }
    return spawnSync(out, [], { encoding: 'utf8', input: options.input ?? '', timeout: 30_000 });
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

async function compiledStdC(
  source: string,
): Promise<{ readonly c: string; readonly std: boolean }> {
  const dir = mkdtempSync(join(tmpdir(), 'stator-std-'));
  try {
    const entry = join(dir, 'main.ts');
    writeFileSync(entry, source);
    const compiled = await compileToC(entry, 'ts');
    assert.ok(compiled !== null, 'the program compiles');
    return compiled;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function compiledStd(source: string): Promise<boolean> {
  return (await compiledStdC(source)).std;
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

test('std/io write keeps program order with console.log on the same stream', NATIVE_ONLY, () => {
  const run = buildAndRun(
    'import { stdout, write } from "std/io";\n' +
      'console.log("one");\nwrite(stdout, "two\\n");\nconsole.log("three");\n',
  );
  assert.equal(run.status, 0);
  assert.equal(run.stdout, 'one\ntwo\nthree\n');
});

test('std/io read takes what stdin holds, then an empty answer at end of file', NATIVE_ONLY, () => {
  const run = buildAndRun(
    'import { read, stdin, stdout, writeBytes } from "std/io";\n' +
      'const first = read(stdin, 64);\nwriteBytes(stdout, first);\n' +
      'console.log(first.length, read(stdin, 64).length);\n',
    { input: 'h\u00e9 \u0000x\n' },
  );
  assert.equal(run.status, 0);
  // The NUL survives: bytes never cross the C-string boundary.
  assert.equal(run.stdout, 'h\u00e9 \u0000x\n7 0\n');
});

// plan.md §11c T11.3a: a `Uint8Array` crosses as its storage, so std/io's bytes take ONE call
// whatever their length — the byte channel this replaced made one call per byte.
test('std/io passes a Uint8Array to its backing as one pointer + length call', async () => {
  const { c } = await compiledStdC(
    'import { read, stdin, stdout, writeBytes } from "std/io";\n' +
      'writeBytes(stdout, read(stdin, 1048576));\n',
  );
  // A call site lands its raw result in an `_jsrt_exr_` local; the forward declaration does not.
  const lines = c.split('\n');
  for (const backing of ['jsrt_std_io_write_bytes', 'jsrt_std_io_read']) {
    const calls = lines.filter((line) => line.includes(`= ${backing}(`));
    assert.equal(calls.length, 1, `one call site for ${backing}`);
    assert.match(calls[0] ?? '', /\(void \*\)jsrt_uint8array_bytes\(.*\), jsrt_uint8array_count\(/);
  }
  assert.ok(!c.includes('jsrt_std_bytes_'), 'no byte channel is left');
});

// The same row carries std/hash and std/encoding: a digest, a random fill and a bytes-to-text
// conversion are each one call, the answer's view passed in for the backing to fill.
test('std/hash and std/encoding pass their bytes as one pointer + length call', async () => {
  const { c } = await compiledStdC(
    'import { bytesToHex } from "std/encoding";\n' +
      'import { randomBytes, sha256 } from "std/hash";\n' +
      'console.log(bytesToHex(sha256(randomBytes(1048576))));\n',
  );
  const lines = c.split('\n');
  const want: ReadonlyArray<readonly [string, number]> = [
    ['jsrt_std_hash_digest', 2],
    ['jsrt_std_hash_random_bytes', 1],
    ['jsrt_std_encoding_to_text', 1],
  ];
  for (const [backing, views] of want) {
    const calls = lines.filter((line) => line.includes(`= ${backing}(`));
    assert.equal(calls.length, 1, `one call site for ${backing}`);
    assert.equal(
      (calls[0] ?? '').split('jsrt_uint8array_count(').length - 1,
      views,
      `${backing} takes ${String(views)} view(s)`,
    );
  }
  assert.ok(!c.includes('jsrt_std_bytes_'), 'no byte channel is left');
});

test('std/io moves a MiB through read and writeBytes byte for byte', NATIVE_ONLY, () => {
  const input = Array.from({ length: 1 << 20 }, (_, i) => String.fromCharCode(32 + (i % 95))).join(
    '',
  );
  const run = buildAndRun(
    'import { read, stderr, stdin, stdout, write, writeBytes } from "std/io";\n' +
      'let total = 0;\nlet chunk = read(stdin, 1048576);\n' +
      'while (chunk.length > 0) {\n  writeBytes(stdout, chunk);\n  total += chunk.length;\n' +
      '  chunk = read(stdin, 1048576);\n}\nwrite(stderr, `${total}\\n`);\n',
    { input },
  );
  assert.equal(run.status, 0);
  assert.equal(run.stderr, `${String(1 << 20)}\n`);
  assert.ok(run.stdout === input, 'the MiB comes back unchanged');
});

test('std/io sees a terminal on a pseudo-terminal', NATIVE_ONLY, () => {
  const run = buildAndRun(
    'import { isatty, stdout, terminalSize } from "std/io";\n' +
      'const size = terminalSize(stdout);\n' +
      'console.log(isatty(stdout), size.columns === Math.floor(size.columns) && size.columns >= 0, ' +
      'size.rows === Math.floor(size.rows) && size.rows >= 0);\n',
    { terminal: true },
  );
  assert.equal(run.status, 0, String(run.stderr));
  // The terminal turns `\n` into `\r\n`, and BSD `script` echoes the EOF it reads (`^D`) first.
  assert.match(run.stdout.replace(/\r\n/g, '\n'), /(^|\n|\b)true true true\n$/);
});

test('std/hash randomBytes draws fresh bytes that cover the whole byte range', NATIVE_ONLY, () => {
  // Two 32-byte draws collide with probability 2^-256, and 65536 bytes miss one of the 256
  // values with probability about 256 * (255/256)^65536, below 10^-100.
  const run = buildAndRun(
    'import { bytesToHex } from "std/encoding";\n' +
      'import { randomBytes } from "std/hash";\n' +
      'console.log(bytesToHex(randomBytes(32)) !== bytesToHex(randomBytes(32)));\n' +
      'const seen = new Uint8Array(256);\n' +
      'for (const byte of randomBytes(65536)) {\n  seen[byte] = 1;\n}\n' +
      'let distinct = 0;\nfor (const flag of seen) {\n  distinct += flag;\n}\n' +
      'console.log(distinct);\n',
  );
  assert.equal(run.status, 0, String(run.stderr));
  assert.equal(run.stdout, 'true\n256\n');
});
