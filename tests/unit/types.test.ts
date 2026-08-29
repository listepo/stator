/* src/hir/types.ts's structural-equality and naming functions had no direct unit tests before this
 * file. `hTypeEquals` is the verifier's only way to compare types (docs/HIR.md: never `===`), and
 * its recursive `fn` case landed with rung 4 (functions) — recursion, arity mismatches, and
 * invariant parameter comparison are exactly the kind of logic a wrong index or an early return
 * gets silently wrong. `hTypeName` is what a user reads in a type-mismatch diagnostic. */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  H_BOOLEAN,
  H_NULL,
  H_NUMBER,
  H_STRING,
  H_UNDEFINED,
  hFunction,
  hTypeEquals,
  hTypeName,
  hUnknown,
} from '../../src/hir/types.ts';

void test('primitive types are equal to themselves and unequal to every other kind', () => {
  assert.equal(hTypeEquals(H_NUMBER, H_NUMBER), true);
  assert.equal(hTypeEquals(H_STRING, H_STRING), true);
  assert.equal(hTypeEquals(H_NUMBER, H_STRING), false);
  assert.equal(hTypeEquals(H_BOOLEAN, H_UNDEFINED), false);
  assert.equal(hTypeEquals(H_NULL, H_UNDEFINED), false);
});

void test('Unknown types are equal only when their fromImplicitAny flag matches', () => {
  // The flag records WHY a value is Unknown (an implicit `any` the gate may reject, vs the js-mode
  // dynamic path it must not) -- two Unknowns that differ only in that flag are not the same type.
  assert.equal(hTypeEquals(hUnknown(true), hUnknown(true)), true);
  assert.equal(hTypeEquals(hUnknown(false), hUnknown(false)), true);
  assert.equal(hTypeEquals(hUnknown(true), hUnknown(false)), false);
});

void test('fn types compare structurally: same shape equal, any differing part unequal', () => {
  const numToStr = hFunction([H_NUMBER], H_STRING);
  const numToStrAgain = hFunction([H_NUMBER], H_STRING);
  assert.equal(hTypeEquals(numToStr, numToStrAgain), true);

  // Different arity.
  assert.equal(hTypeEquals(hFunction([], H_STRING), numToStr), false);
  assert.equal(hTypeEquals(hFunction([H_NUMBER, H_NUMBER], H_STRING), numToStr), false);

  // Different parameter type, same arity.
  assert.equal(hTypeEquals(hFunction([H_STRING], H_STRING), numToStr), false);

  // Different return type.
  assert.equal(hTypeEquals(hFunction([H_NUMBER], H_BOOLEAN), numToStr), false);

  // Parameter order matters -- this is identity, not a set comparison.
  const twoParams = hFunction([H_NUMBER, H_STRING], H_BOOLEAN);
  const swapped = hFunction([H_STRING, H_NUMBER], H_BOOLEAN);
  assert.equal(hTypeEquals(twoParams, swapped), false);

  // Nesting: a function returning a function still compares recursively, not by reference.
  const higherOrder = hFunction([H_NUMBER], hFunction([H_STRING], H_BOOLEAN));
  const higherOrderAgain = hFunction([H_NUMBER], hFunction([H_STRING], H_BOOLEAN));
  assert.equal(hTypeEquals(higherOrder, higherOrderAgain), true);
  assert.equal(
    hTypeEquals(higherOrder, hFunction([H_NUMBER], hFunction([H_BOOLEAN], H_BOOLEAN))),
    false,
  );
});

void test('hTypeName matches the primitive kind name, and formats fn as a signature', () => {
  assert.equal(hTypeName(H_NUMBER), 'number');
  assert.equal(hTypeName(H_STRING), 'string');
  assert.equal(hTypeName(H_BOOLEAN), 'boolean');
  assert.equal(hTypeName(H_UNDEFINED), 'undefined');
  assert.equal(hTypeName(H_NULL), 'null');

  assert.equal(
    hTypeName(hFunction([H_NUMBER, H_STRING], H_BOOLEAN)),
    '(a0: number, a1: string) => boolean',
  );
  assert.equal(hTypeName(hFunction([], H_UNDEFINED)), '() => undefined');
});
