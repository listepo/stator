/* Builtins dashboard red-drift check (plan.md §8 step-12 bookkeeping debt).
 *
 * tests/golden/builtins.ts verifies the GREEN direction: every claimed fixture
 * must exist and mention its member, so the table cannot claim what it does not
 * prove. This file verifies the RED direction: a member with an EMPTY claim must
 * have no implementation in the runtime, so a landed member with an empty claim
 * fails the build instead of sitting at 0% beside passing goldens.
 *
 * The runtime side is the contract header (packages/runtime/include/jsrt_value.h),
 * which declares every builtin entry point generated C can call. The expected
 * symbol is mechanical -- jsrt_<namespace>_<snake_case(member)> with `.prototype`
 * dropped -- except console, whose entry points come from the same CONSOLE_METHODS
 * table codegen emits through, so the check cannot drift from the emitter.
 * `globals` is skipped: NaN/Infinity/undefined are values, not entry points.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CONSOLE_METHODS } from '../../compiler/src/hir/nodes.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const TABLE = join(HERE, '..', 'golden', 'builtins_coverage.json');
const HEADER = join(HERE, '..', '..', '..', 'packages', 'runtime', 'include', 'jsrt_value.h');

function snakeCase(member: string): string {
  return member
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

function expectedSymbols(namespace: string, member: string): readonly string[] {
  if (namespace === 'console') {
    const table: Readonly<Record<string, { readonly fn: string; readonly bare?: string }>> =
      CONSOLE_METHODS;
    const shape = table[member];
    if (shape === undefined) {
      throw new Error(`console.${member} is not in CONSOLE_METHODS`);
    }
    return shape.bare !== undefined ? [shape.fn, shape.bare] : [shape.fn];
  }
  const prefix = namespace.replace('.prototype', '').toLowerCase();
  return [`jsrt_${prefix}_${snakeCase(member)}`];
}

function declaredSymbols(): ReadonlySet<string> {
  const header = readFileSync(HEADER, 'utf8');
  return new Set(header.match(/\bjsrt_[A-Za-z0-9_]+\b/g) ?? []);
}

function emptyClaims(): { readonly namespace: string; readonly member: string }[] {
  const raw: unknown = JSON.parse(readFileSync(TABLE, 'utf8'));
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('builtins_coverage.json must be an object of namespaces');
  }
  const empty: { namespace: string; member: string }[] = [];
  for (const [namespace, members] of Object.entries(raw)) {
    if (namespace.startsWith('_') || namespace === 'globals') {
      continue;
    }
    if (typeof members !== 'object' || members === null) {
      throw new Error(`namespace '${namespace}' must map members to claims`);
    }
    for (const [member, claim] of Object.entries(members)) {
      if (Array.isArray(claim) && claim.length === 0) {
        empty.push({ namespace, member });
      }
    }
  }
  return empty;
}

void test('an empty coverage claim means no runtime entry point', () => {
  const declared = declaredSymbols();
  const drifted: string[] = [];
  for (const { namespace, member } of emptyClaims()) {
    for (const symbol of expectedSymbols(namespace, member)) {
      if (declared.has(symbol)) {
        drifted.push(
          `${namespace}.${member}: claims [] but ${symbol} is declared in jsrt_value.h — ` +
            'cite the proving fixture in builtins_coverage.json',
        );
      }
    }
  }
  assert.deepEqual(drifted, []);
});
