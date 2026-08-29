/* Map and Set (rung 7) — the two builtins the subset compiles, and the only place where the
 * frontend has to tell a GLOBAL apart from a user declaration by something other than its name.
 *
 * The golden fixtures prove the runtime behaviour against Node. What they cannot show is the
 * decision that precedes it: `class Map {}` in user code is an ordinary class and must NOT become a
 * hash table, `m.entries()` must be refused rather than silently accepted, and `m.set(k)` with the
 * value missing has no argv to pad. Those are tested here, at the layer that makes them.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import ts from 'typescript';
import { tsTypeToHType } from '../../src/frontend/types.ts';
import type { CollectionNew, CollectionOp, Declaration } from '../../src/hir/nodes.ts';
import { hTypeName } from '../../src/hir/types.ts';
import { createProgram, gateCodes, loweredStatements } from './helpers.ts';

/** The expression a `const` binds, for the sources below that declare one collection and use it. */
function declaredValue(code: string): Declaration['value'] {
  const [decl] = loweredStatements(code);
  assert.equal(decl?.kind, 'declaration');
  return (decl as Declaration).value;
}

/** The operation in the LAST statement, whether that statement discards its value or prints it. */
function lastOperation(code: string): CollectionOp {
  const stmt = loweredStatements(code).at(-1);
  assert.equal(stmt?.kind, 'expression-statement');
  const expr = (stmt as { expression: { kind: string; args?: readonly { kind: string }[] } })
    .expression;
  const op = expr.kind === 'console-log' ? expr.args?.[0] : expr;
  assert.equal(op?.kind, 'collection-op');
  return op as CollectionOp;
}

void test('a construction carries the key and value types the checker resolved', () => {
  const value = declaredValue('const m = new Map<string, number>();\nconsole.log(m.size);');
  assert.equal(value.kind, 'collection-new');
  assert.equal((value as CollectionNew).collection, 'map');
  assert.equal(hTypeName(value.type), 'Map<string, number>');

  const set = declaredValue('const s = new Set<string>();\nconsole.log(s.size);');
  assert.equal((set as CollectionNew).collection, 'set');
  assert.equal(hTypeName(set.type), 'Set<string>');
});

void test('a nested collection is a type, not a special case', () => {
  const value = declaredValue('const m = new Map<string, Set<number>>();\nconsole.log(m.size);');
  assert.equal(hTypeName(value.type), 'Map<string, Set<number>>');
});

void test('the operations lower to one node naming the operation, receiver first', () => {
  const op = lastOperation("const m = new Map<string, number>();\nm.set('a', 1);");
  assert.equal(op.collection, 'map');
  assert.equal(op.op, 'set');
  assert.equal(op.target.kind, 'identifier');
  assert.equal(op.args.length, 2);
  assert.equal(op.args[0]?.kind, 'string-literal');

  // `.size` is an operation with no arguments rather than a property read: the HIR has no node for
  // reading a field off a builtin, and the emitter must not read the struct field itself.
  const size = lastOperation('const m = new Map<string, number>();\nconsole.log(m.size);');
  assert.equal(size.op, 'size');
  assert.equal(size.args.length, 0);
});

void test('`add` on a Set is its own operation, distinct from `set`', () => {
  const op = lastOperation("const s = new Set<string>();\ns.add('a');");
  assert.equal(op.collection, 'set');
  assert.equal(op.op, 'add');
  assert.equal(op.args.length, 1);
});

// The load-bearing one. Everything else here is about a real Map; this is about a value that only
// LOOKS like one, and must stay an ordinary class. It is asked of the type mapping rather than the
// gate because shadowing the global takes a MODULE -- at the top level of a script `class Map` is a
// duplicate identifier, and TypeScript rejects the file before any of this is reached.
void test('a user class named Map is a class, not a collection', () => {
  const { program } = createProgram(
    'export {};\nclass Map {\n  n: number;\n  constructor() {\n    this.n = 1;\n  }\n}\nconst m = new Map();\n',
    '/test.ts',
  );
  const checker = program.getTypeChecker();
  const file = program.getSourceFile('/test.ts');
  assert.ok(file !== undefined);
  assert.deepEqual(
    program.getSemanticDiagnostics(file).map((d) => d.code),
    [],
    'a class shadowing the global inside a module is legal TypeScript',
  );
  const statement = file.statements.at(-1);
  assert.ok(statement !== undefined && ts.isVariableStatement(statement));
  const declaration = statement.declarationList.declarations[0];
  assert.ok(declaration !== undefined);
  const type = tsTypeToHType(checker.getTypeAtLocation(declaration.name), checker);
  // `Map`, not `Map<…, …>`: an HObject naming the descriptor the emitter emits for the class.
  assert.equal(type.kind, 'object');
  assert.equal(hTypeName(type), 'Map');
});

void test('a method the runtime does not implement is refused, not accepted silently', () => {
  // Iteration is the Symbol.iterator protocol, which this rung does not model. Accepting it here
  // would reach the lowering with no node to lower it to.
  assert.deepEqual(gateCodes('const m = new Map<string, number>();\nconsole.log(m.entries());'), [
    'STA1214',
  ]);
  assert.deepEqual(gateCodes('const s = new Set<string>();\nconsole.log(s.forEach);'), ['STA1214']);
});

void test('a wrong argument count is refused: there is no argv to pad', () => {
  assert.deepEqual(gateCodes("const m = new Map<string, number>();\nm.set('a');"), ['STA1214']);
  assert.deepEqual(gateCodes("const s = new Set<string>();\ns.add('a', 'b');"), ['STA1214']);
});

void test('constructing from an iterable is refused, and says so once', () => {
  assert.deepEqual(
    gateCodes("const m = new Map<string, number>([['a', 1]]);\nconsole.log(m.size);"),
    ['STA1214'],
  );
});
