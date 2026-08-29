/* Pins every constant docs/NUMERIC.md §10 asserts to what the pinned Node actually produces.
 *
 * This tests Node, not Stator, which is unusual for a unit test and deliberate: NUMERIC.md is a
 * normative document, the arithmetic rung will be implemented against it, and a wrong constant in
 * it becomes a wrong constant in a golden test that then "passes". One claim in the first draft was
 * wrong in exactly that way (`1e21 | 0` is NEGATIVE), and this file is why it was caught.
 *
 * When Stator implements an operator, its behaviour is checked in tests/golden/ against Node
 * directly. This file guards the document in the meantime, and afterwards guards it against edits.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

/** `==` between unrelated types is exactly what §6.3 is about, and exactly what TypeScript
 * refuses to typecheck (TS2367). Widening to `unknown` is the narrowest way to ask the question:
 * it removes the static objection without touching the runtime comparison being tested. */
function looseEquals(a: unknown, b: unknown): boolean {
  // biome-ignore lint/suspicious/noDoubleEquals: the loose comparison IS the subject under test
  return a == b;
}

/** Each entry is a claim in docs/NUMERIC.md §10, in the section order the document uses. */
const CLAIMS: readonly (readonly [string, () => boolean, boolean])[] = [
  // §4.2 — >>> can produce a value i32 cannot hold
  ['(0xFFFFFFFF >>> 0) === 4294967295', () => 0xffffffff >>> 0 === 4294967295, true],
  ['(-1 >>> 0) === 4294967295', () => -1 >>> 0 === 4294967295, true],

  // §5.1 — -0 is observable in exactly four places
  ['Object.is(-0, 0)', () => Object.is(-0, 0), false],
  ['1 / -0 === -Infinity', () => 1 / -0 === Number.NEGATIVE_INFINITY, true],
  ['Math.sign(-0) is -0', () => Object.is(Math.sign(-0), -0), true],
  ['String(-0) === "0"', () => String(-0) === '0', true],

  // §5.2 — one NaN, and the three equality predicates disagree in two directions
  // biome-ignore lint/suspicious/noSelfCompare: NaN failing to equal itself is the claim
  // biome-ignore lint/correctness/useIsNan: rewriting this to Number.isNaN would delete the test
  ['NaN !== NaN', () => Number.NaN !== Number.NaN, true],
  ['Object.is(NaN, NaN)', () => Object.is(Number.NaN, Number.NaN), true],

  // §3.1/§3.2 — / is never integer division; % needs the zero guard
  ['1 / 0 === Infinity', () => 1 / 0 === Number.POSITIVE_INFINITY, true],
  ['1 / 2 === 0.5', () => 1 / 2 === 0.5, true],
  ['5 % 0 is NaN', () => Number.isNaN(5 % 0), true],
  ['% takes the sign of the dividend', () => 5 % 3 === 2 && -5 % 3 === -2, true],

  // §2.3 — overflow promotes, it does not wrap
  ['2147483647 + 1 === 2147483648', () => 2147483647 + 1 === 2147483648, true],

  // §4.1 — ToInt32 is modular and truncates toward zero. Read off Node; do not re-derive.
  ['(1 / 3 | 0) === 0', () => ((1 / 3) | 0) === 0, true],
  ['(2147483648 | 0) === -2147483648', () => (2147483648 | 0) === -2147483648, true],
  ['(1e21 | 0) === -559939584', () => (1e21 | 0) === -559939584, true],
  ['(1e10 | 0) === 1410065408', () => (1e10 | 0) === 1410065408, true],
  ['(4294967296 | 0) === 0', () => (4294967296 | 0) === 0, true],
  ['(NaN | 0) === 0', () => (Number.NaN | 0) === 0, true],
  ['(Infinity | 0) === 0', () => (Number.POSITIVE_INFINITY | 0) === 0, true],

  // §4.3 — shift counts are masked to 5 bits
  ['(1 << 32) === 1', () => 1 << 32 === 1, true],
  ['x >> 31 differs from x >> 32', () => -1 >> 31 !== -1 >> 32 || 5 >> 31 !== 5 >> 32, true],

  // §6.1 — NaN makes all four relational operators false at once
  // biome-ignore lint/suspicious/noSelfCompare: a relational operator on NaN is the claim
  // biome-ignore lint/correctness/useIsNan: `<=` and `Number.isNaN` are not interchangeable here
  ['NaN <= NaN', () => Number.NaN <= Number.NaN, false],

  // §6.3 — the loose-equality table, including the pair that surprises
  ['null == undefined', () => looseEquals(null, undefined), true],
  ['null == 0', () => looseEquals(null, 0), false],
  ["'' == 0", () => looseEquals('', 0), true],
  ["'0x10' == 16", () => looseEquals('0x10', 16), true],

  // §6.3 — ToNumber(string) is the spec grammar, not strtod
  ['Number("") === 0', () => Number('') === 0, true],
  ['Number("Infinity") === Infinity', () => Number('Infinity') === Number.POSITIVE_INFINITY, true],
  ['Number("12abc") is NaN', () => Number.isNaN(Number('12abc')), true],

  // §9 — the transforms a pass must not make
  ['(0.1 + 0.2) !== 0.3', () => 0.1 + 0.2 !== 0.3, true],
  ['0 * -1 is -0 (const-fold canary)', () => Object.is(0 * -1, -0), true],
  ['-0 + 0 is +0, so x + 0 is not x', () => Object.is(-0 + 0, 0), true],
];

for (const [name, evaluate, expected] of CLAIMS) {
  // `void`: node:test returns a promise the runner owns; we are not awaiting it here.
  void test(`NUMERIC.md: ${name}`, () => {
    assert.equal(evaluate(), expected);
  });
}
