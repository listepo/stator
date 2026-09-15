// @mode: js
// @verdict: static
// SUBSET.md: Generics — a generic passed to a receiver op specializes at the callback's
// type exactly as to an ordinary call's: `arr.map(box)` passes `box<number>`.

function box<T>(x: T): T {
  return x;
}
console.log([1, 2, 3].map(box));
[1, 2, 3].forEach(box);
