/* Module-graph tests (plan.md Task 3.11): topological order, cycle rejection, collision
 * refusal, and the type-only exemption.
 *
 * These build programs from REAL temp files, unlike the in-memory helper the other suites use:
 * moduleOrder resolves specifiers through ts.sys, so an in-memory host would exercise a
 * different resolver than the compiler ships. */
import * as assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test } from 'node:test';
import { moduleOrder } from '../../src/frontend/graph.ts';
import { createProgram } from '../../src/frontend/program.ts';

function withFiles<T>(files: Record<string, string>, f: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'stator-graph-'));
  try {
    for (const [name, source] of Object.entries(files)) {
      writeFileSync(join(dir, name), source);
    }
    return f(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function order(files: Record<string, string>, entry: string) {
  return withFiles(files, (dir) => {
    const { program } = createProgram(join(dir, entry), 'ts');
    const entryFile = program.getSourceFile(join(dir, entry));
    assert.ok(entryFile);
    const result = moduleOrder(program, entryFile, 'ts');
    return {
      names: result.order.map((file) => basename(file.fileName)),
      diagnostics: result.diagnostics,
    };
  });
}

test('a -> b -> c orders c, b, a with the entry last', () => {
  const { names, diagnostics } = order(
    {
      'a.ts': 'import { d } from "./b.ts";\nconsole.log(d);\n',
      'b.ts': 'import { base } from "./c.ts";\nexport const d: number = base * 2;\n',
      'c.ts': 'export const base: number = 10;\n',
    },
    'a.ts',
  );
  assert.deepEqual(names, ['c.ts', 'b.ts', 'a.ts']);
  assert.deepEqual(diagnostics, []);
});

test('an import cycle is STA3001 and spells the cycle path', () => {
  const { diagnostics } = order(
    {
      'a.ts': 'import { y } from "./b.ts";\nexport const x: number = y + 1;\n',
      'b.ts': 'import { x } from "./a.ts";\nexport const y: number = x + 1;\n',
    },
    'a.ts',
  );
  const cycle = diagnostics.find((d) => d.code === 'STA3001');
  assert.ok(cycle);
  assert.equal(cycle.class, 'error');
  // The message is the cycle's spelling: entry -> partner -> entry.
  const hops = cycle.message.split(' → ').map((p) => basename(p));
  assert.deepEqual(hops, ['a.ts', 'b.ts', 'a.ts']);
});

test('the same top-level name in two files is refused, naming both files', () => {
  const { diagnostics } = order(
    {
      'a.ts':
        'import { helper } from "./b.ts";\nconst secret: number = 1;\nconsole.log(helper() + secret);\n',
      'b.ts':
        'const secret: number = 2;\nexport function helper(): number {\n  return secret;\n}\n',
    },
    'a.ts',
  );
  const collision = diagnostics.find((d) => d.code === 'STA1214');
  assert.ok(collision);
  assert.match(collision.message, /'secret'/);
  assert.match(collision.message, /a\.ts/);
  assert.match(collision.message, /b\.ts/);
});

test('a type-only import creates no graph edge', () => {
  const { names, diagnostics } = order(
    {
      'a.ts':
        'import type { Shape } from "./b.ts";\nconst s: Shape = { width: 3 };\nconsole.log(s.width);\n',
      'b.ts':
        'export interface Shape {\n  readonly width: number;\n}\nconsole.log("must not run");\n',
    },
    'a.ts',
  );
  // b.ts is type-reachable only, so its top-level code is not part of the program.
  assert.deepEqual(names, ['a.ts']);
  assert.deepEqual(diagnostics, []);
});
