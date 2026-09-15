// sqlite-demo.ts — the SQLite demo runner (FFI track, phase-Check program).
//
// Builds demo.ts with in-process `build()` (the golden runner's pattern),
// runs the linked executable, and byte-compares stdout against expected.txt.
// The `-lsqlite3` flag arrives via the generated binding's `@statorLink`
// pragma — asserted nowhere here by design; this runner only builds, runs,
// and compares. Prints `sqlite demo: ok`; any mismatch fails loudly.
//
// Modeled on packages/tests/ffi/example-c-consumer/c-consumer.ts minus the
// header/object parts: this demo links an executable, not an object.
//
// Usage: mise exec node -- node examples/ffi/sqlite/sqlite-demo.ts
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFixture } from '../../../packages/tests/support/fixture-build.ts';
import { runProcess } from '../../../packages/tests/support/parallel.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

function fail(message: string): never {
  process.stderr.write(`sqlite demo: FAIL ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), 'stator-sqlite-demo-'));
  try {
    const app = join(work, 'app');
    try {
      await buildFixture({ entry: join(HERE, 'demo.ts'), out: app, mode: 'ts' });
    } catch (error) {
      fail(`stator build failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const exec = await runProcess(app, [], { env: process.env });
    if (exec.status !== 0) {
      fail(`demo exited ${String(exec.status)}: ${exec.stderr.trim()}`);
    }
    const expected = readFileSync(join(HERE, 'expected.txt'), 'utf8');
    if (exec.stdout !== expected) {
      fail(
        `output differs\n  actual:   ${JSON.stringify(exec.stdout)}\n  expected: ${JSON.stringify(expected)}`,
      );
    }
    process.stdout.write('sqlite demo: ok\n');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

await main();
