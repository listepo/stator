/* Task 7.3 (v0.1): the `Out<T>` out-slot surface below the decision fixtures.
 *
 * Decision fixtures pin verdicts per file; this file pins what a verdict cannot see: the
 * classifier's `out-pointer` mapping (brand and `CString` inners, return-position and
 * malformed refusals), the cast tags the emitter reads, and the slot-constructor
 * recognition (blessed ambient declare versus a user's own same-named function).
 * Execution proofs live in the SQLite demo (`examples/ffi/sqlite/`), which links real
 * `T**` calls; nothing here links.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as ts from 'typescript';
import type { ExternClassified } from '../../compiler/src/frontend/extern.ts';
import {
  classifyExternDeclaration,
  classifyOutSlotCall,
  outInnerTag,
  outSlotDeclarationOf,
} from '../../compiler/src/frontend/extern.ts';
import { outSlotInner } from '../../compiler/src/frontend/types.ts';
import { createProgram } from './helpers.ts';

const PRELUDE = `type Out<T> = { readonly value: T };
type Db = { readonly __brand: "db" };
type CString = string & { readonly __statorCstr: "CString" };
declare function outSlot<T>(): Out<T>;
`;

/** Classify the LAST function declaration of a single-file program (the extern.test.ts
 * pattern, except the prelude declares the `outSlot` constructor first — the declaration
 * under test comes last). */
function classifyFirst(source: string): ExternClassified {
  const { program, sourceFile } = createProgram(source);
  const checker = program.getTypeChecker();
  let found: ExternClassified | undefined;
  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt)) {
      found = classifyExternDeclaration(stmt, checker);
    }
  }
  if (found === undefined) {
    throw new Error('no function declaration in test source');
  }
  return found;
}

function firstCall(
  source: string,
): { call: ts.CallExpression; checker: ts.TypeChecker } | undefined {
  const { program, sourceFile } = createProgram(source);
  const checker = program.getTypeChecker();
  let found: ts.CallExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (found === undefined && ts.isCallExpression(node)) {
      found = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found === undefined ? undefined : { call: found, checker };
}

void test('Out<brand> and Out<CString> params map to out-pointer; returns refuse', () => {
  const ok = classifyFirst(
    PRELUDE +
      '/** @statorExtern open */\ndeclare function openDb(n: CString, db: Out<Db>): number;',
  );
  assert.equal(ok.ok, true);
  if (!ok.ok) {
    throw new Error('unreachable');
  }
  assert.deepEqual([...ok.signature.params], ['cstring', 'out-pointer']);
  assert.equal(ok.signature.ret, 'number');

  const tail = classifyFirst(
    PRELUDE +
      '/** @statorExtern prepare */\ndeclare function prepare(d: Db, t: Out<CString>): number;',
  );
  assert.equal(tail.ok, true);
  if (!tail.ok) {
    throw new Error('unreachable');
  }
  assert.deepEqual([...tail.signature.params], ['pointer', 'out-pointer']);

  const ret = classifyFirst(
    PRELUDE + '/** @statorExtern make */\ndeclare function makeSlot(): Out<Db>;',
  );
  assert.equal(ret.ok, false);
  if (ret.ok) {
    throw new Error('unreachable');
  }
  assert.equal(ret.code, 'STA1119');
});

void test('malformed Out spellings refuse as STA1125, not the catch-all', () => {
  for (const bad of [
    'Out<number>',
    'Out<string>',
    'Out<unknown>',
    'Out<Db[]>',
    'Out<{ x: number }>',
  ]) {
    const refused = classifyFirst(
      PRELUDE + `/** @statorExtern f */\ndeclare function f(s: ${bad}): number;`,
    );
    assert.equal(refused.ok, false, bad);
    if (refused.ok) {
      throw new Error('unreachable');
    }
    assert.equal(refused.code, 'STA1125', bad);
  }
});

void test('the cast tags ride the parameter spelling', () => {
  const { program, sourceFile } = createProgram(
    PRELUDE + '/** @statorExtern f */\ndeclare function f(a: Out<Db>, b: Out<CString>): number;',
  );
  const checker = program.getTypeChecker();
  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name?.text === 'f') {
      const [a, b] = stmt.parameters;
      if (a === undefined || b === undefined) {
        throw new Error('arity changed under test');
      }
      assert.equal(outInnerTag(checker.getTypeAtLocation(a), checker), 'db');
      assert.equal(outInnerTag(checker.getTypeAtLocation(b), checker), 'char');
    }
  }
});

void test('outSlotInner accepts brands and CString wrappers, nothing else', () => {
  const { program, sourceFile } = createProgram(
    PRELUDE +
      'declare const a: Out<Db>;\ndeclare const b: Out<CString>;\ndeclare const c: Out<number>;\ndeclare const d: { readonly value: Db };\ndeclare const e: Db;\n',
  );
  const checker = program.getTypeChecker();
  const seen = new Map<string, boolean>();
  for (const stmt of sourceFile.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          seen.set(
            decl.name.text,
            outSlotInner(checker.getTypeAtLocation(decl.name), checker) !== undefined,
          );
        }
      }
    }
  }
  assert.deepEqual(
    [...seen],
    [
      ['a', true],
      ['b', true],
      ['c', false],
      ['d', false],
      ['e', false],
    ],
  );
});

void test('the constructor is recognized by declaration shape, not by name alone', () => {
  const good = firstCall(PRELUDE + 'declare const s: Out<Db>;\nconst t = outSlot<Db>();\n');
  assert.notEqual(good, undefined);
  if (good === undefined) {
    throw new Error('unreachable');
  }
  assert.notEqual(outSlotDeclarationOf(good.call, good.checker), undefined);
  assert.equal(classifyOutSlotCall(good.call, good.checker).ok, true);

  // A real implementation under the name is the user's own function, never the builtin.
  const own = firstCall(
    'function outSlot<T>(): number {\n  return 1;\n}\nconst n = outSlot<number>();\n',
  );
  assert.notEqual(own, undefined);
  if (own === undefined) {
    throw new Error('unreachable');
  }
  assert.equal(outSlotDeclarationOf(own.call, own.checker), undefined);

  // Bare outSlot() with no type argument and no annotation earns the missing-type refusal.
  const bare = firstCall(PRELUDE + 'const u = outSlot();\n');
  assert.notEqual(bare, undefined);
  if (bare === undefined) {
    throw new Error('unreachable');
  }
  assert.notEqual(outSlotDeclarationOf(bare.call, bare.checker), undefined);
  assert.equal(classifyOutSlotCall(bare.call, bare.checker).ok, false);
});
