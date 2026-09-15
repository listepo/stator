/* Task 7.2 step 9: the CI example runner (plan.md §10) — builds `unit.ts` with
 * `--emit-header` (NO main), double-builds the header and byte-compares it (step 8's
 * determinism rule), links `main.c` against the object and `libjsrt.a` under the same
 * C11 -Wall -Wextra -Werror discipline as the runtime, runs the app, and byte-compares
 * stdout against `expected.txt`. Deterministic, offline, no new dependencies.
 *
 * This is a smoke example, not a second suite: the init/throws/frame contract itself is
 * pinned in `tests/unit/export-stubs.test.ts`, which this file must not duplicate.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { staleLdRetryArgs } from '../../../compiler/src/support/toolchain.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', '..', '..', 'compiler', 'src', 'cli', 'main.ts');
const RUNTIME_LIB_DIR = join(HERE, '..', '..', '..', 'runtime', 'build');
const RUNTIME_INCLUDE = join(HERE, '..', '..', '..', 'runtime', 'include');
const RUNTIME_ARCHIVE = join(RUNTIME_LIB_DIR, 'libjsrt.a');

function fail(message: string): never {
  process.stderr.write(`ffi c-consumer: FAIL ${message}\n`);
  process.exit(1);
}

function run(command: string, args: readonly string[], what: string): string {
  const result = spawnSync(command, [...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    fail(`${what} exited ${String(result.status)}:\n${result.stdout}${result.stderr}`);
  }
  return result.stdout;
}

/** The archive's own system dependencies, recorded beside it by the just recipe that built
 * it — the same flags `linkExecutable` reads, so this hand link is the link a user gets. */
function archiveSystemFlags(): string[] {
  const recorded = join(RUNTIME_LIB_DIR, 'link-flags.txt');
  if (!existsSync(recorded)) {
    fail(`runtime archive flags missing at ${recorded} — run the runtime recipe first`);
  }
  const flags = readFileSync(recorded, 'utf8').trim();
  const split: string[] = flags === '' ? [] : flags.split(/\s+/);
  return split;
}

function main(): void {
  if (!existsSync(RUNTIME_ARCHIVE)) {
    fail(`runtime archive missing at ${RUNTIME_ARCHIVE} — run the runtime recipe first`);
  }
  const sysFlags = archiveSystemFlags();
  const work = mkdtempSync(join(tmpdir(), 'stator-c-consumer-'));
  try {
    const first = join(work, 'consumer.h');
    const second = join(work, 'consumer2.h');
    const obj = join(work, 'unit.o');
    run(
      process.execPath,
      [
        CLI,
        'build',
        join(HERE, 'unit.ts'),
        '-o',
        obj,
        '--emit-header',
        first,
        '--unit-name',
        'consumer',
      ],
      'stator build (first)',
    );
    run(
      process.execPath,
      [
        CLI,
        'build',
        join(HERE, 'unit.ts'),
        '-o',
        join(work, 'unit2.o'),
        `--emit-header=${second}`,
        '--unit-name',
        'consumer',
      ],
      'stator build (second)',
    );
    if (!readFileSync(first).equals(readFileSync(second))) {
      fail('same input emitted byte-different headers');
    }
    const app = join(work, 'app');
    // Consumer-side link shares the CLI's stale-linker retry (stale bundled ld vs a newer
    // Xcode SDK fails here exactly as in `build.ts` link()): one attempt, one retry under
    // the newest readable CLT SDK, then the failure stands.
    const linkArgs: readonly string[] = [
      '-std=c11',
      '-Wall',
      '-Wextra',
      '-Werror',
      '-I',
      RUNTIME_INCLUDE,
      '-I',
      work,
      join(HERE, 'main.c'),
      obj,
      '-L',
      RUNTIME_LIB_DIR,
      '-ljsrt',
      ...sysFlags,
      '-o',
      app,
    ];
    const firstLink = spawnSync('clang', [...linkArgs], { encoding: 'utf8' });
    if (firstLink.status !== 0) {
      const retry = staleLdRetryArgs(linkArgs, firstLink.stderr, {
        darwin: process.platform === 'darwin',
        defaultCc: true,
        sanitized: false,
      });
      if (retry === undefined) {
        fail(
          `clang link exited ${String(firstLink.status)}:\n${firstLink.stdout}${firstLink.stderr}`,
        );
      }
      run('clang', retry.args, 'clang link');
    }
    const output = run(app, [], 'consumer app');
    const expected = readFileSync(join(HERE, 'expected.txt'), 'utf8');
    if (output !== expected) {
      fail(
        `output differs\n  actual:   ${JSON.stringify(output)}\n  expected: ${JSON.stringify(expected)}`,
      );
    }
    process.stdout.write('ffi c-consumer: ok\n');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main();
