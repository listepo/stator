// @mode: js
// @verdict: dynamic
// SUBSET.md: Function declarations, function expressions, arrow functions
// `fn.length` on an untyped function value answers the declared arity through the dynamic
// property path (plan.md §8 step 21b); a method's closure never counts its receiver.

function arity(fn) {
  return fn.length;
}
const g = (x) => x;
export const n = arity(g);

class C {
  add(a, b) {
    return a + b;
  }
}
const o = new C();
export const m = arity(o.add);
