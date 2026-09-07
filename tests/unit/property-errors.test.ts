import assert from 'node:assert/strict';
import { test } from 'node:test';

import { emitC } from '../../src/codegen/index.ts';
import { lowerSource } from './helpers.ts';

test('throwing property operations check pending before their result is consumed', () => {
  for (const [source, operation] of [
    ['function f(o) { return o.x; }', 'jsrt_get_prop'],
    ['function f(o, k) { return o[k]; }', 'jsrt_dyn_index_get'],
    ['function f(o, k) { o[k] = 1; }', 'jsrt_dyn_index_set'],
    ['function f(o, k) { return o[k] += 1; }', 'jsrt_dyn_index_get'],
    ['const o = { get x() { return 1; } }; Object.values(o);', 'jsrt_object_values'],
    ['const o = { get x() { return 1; } }; Object.entries(o);', 'jsrt_object_entries'],
    ['const o = { get x() { return 1; } }; JSON.stringify(o);', 'jsrt_json_stringify'],
    ['const o = { get x() { return 1; } }; console.table(o);', 'jsrt_console_table'],
    ['const o = { get x() { return 1; } }; const r = console.table(o);', 'jsrt_console_table'],
  ]) {
    assert.ok(source !== undefined && operation !== undefined);
    const { module, diagnostics } = lowerSource(source, '/test.js');
    assert.deepEqual(diagnostics, [], source);
    const c = emitC(module);
    const lines = c.split('\n').filter((line) => !line.startsWith('#line'));
    const index = lines.findIndex((line) => line.includes(`${operation}(`));
    assert.ok(index >= 0, operation);
    assert.match(lines[index + 1] ?? '', /if \(jsrt_pending\(\)\)/, source);
  }
});
