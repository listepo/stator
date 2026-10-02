// @mode: js
// @verdict: dynamic
// SUBSET.md: Object literals with static keys
// An object spread of an untyped value: the literal types `any` with it, takes the dynamic
// path, and folds the operand through the shape-table `assign` -- own enumerable keys of an
// object, a string's indices, and nothing at all for `undefined`, `null`, a number or a
// boolean, as §13.2.5.5 CopyDataProperties answers (plan-notes 297). `{ ...null }` written
// literally and an array spread beside an own key stay not-yet (subset_spread_dynamic_js).
const u = JSON.parse('{"a":1}');
export const a = { ...u };
export const b = { x: 1, ...u, y: 2 };
function f(x) {
  return { ...x };
}
console.log(a, b, f({ q: 1 }), f(undefined), f(null), f(5), f('hi'));
