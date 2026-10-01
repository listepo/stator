import { strict as assert } from 'node:assert';
import { test } from '../support/rs.ts';
import { hirNodes, lowerSource } from './helpers.ts';

function kindsOf(code: string): string[] {
  const { module, diagnostics } = lowerSource(code, '/test.js');
  assert.equal(diagnostics.length, 0, diagnostics.map((d) => d.message).join('\n'));
  return hirNodes(module).map((n) => n.kind);
}

test('an untyped property read and write lower to dyn-field nodes', () => {
  const kinds = kindsOf('function f(o) { o.x = 1; return o.x; }');
  assert.ok(kinds.includes('dyn-field-assignment'), `got ${kinds.join(', ')}`);
  assert.ok(kinds.includes('dyn-field-access'), `got ${kinds.join(', ')}`);
});

test('an untyped computed index lowers to index-access / index-assignment on Unknown', () => {
  const kinds = kindsOf('function f(o, k, v) { o[k] = v; return o[k]; }');
  assert.ok(kinds.includes('index-assignment'), `got ${kinds.join(', ')}`);
  assert.ok(kinds.includes('index-access'), `got ${kinds.join(', ')}`);
});

test('an empty object literal lowers to a dyn-object-literal so it can grow', () => {
  const kinds = kindsOf('let o = {}; o.x = 1;');
  assert.ok(kinds.includes('dyn-object-literal'), `got ${kinds.join(', ')}`);
  assert.ok(kinds.includes('dyn-field-assignment'), `got ${kinds.join(', ')}`);
});
