// @mode: ts
// @verdict: static
// SUBSET.md: Function declarations, function expressions, arrow functions
// `fn.length` on a statically-typed function is a direct read of the closure's declared arity,
// which never counts a method's receiver (docs/VALUE.md §4.16, plan.md §8 step 21b).

function arity(fn: (x: number) => number): number {
  return fn.length;
}
const g = (x: number): number => x;
export const n = arity(g);

class C {
  add(a: number, b: number): number {
    return a + b;
  }
}
const o = new C();
const f = o.add;
export const m = f.length;
