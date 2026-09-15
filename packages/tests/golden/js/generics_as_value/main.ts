// js-mode twin of `ts/generics_as_value.ts`.

function box<T>(x: T): T {
  return x;
}
const f = box;
console.log(f(7));
console.log(f("b"));

function run(cb: (x: number) => number, v: number): number {
  return cb(v);
}
console.log(run(box, 8));
console.log(run(f, 9));

// Generic as-value (plan.md §8 step 41): `typeof` folds to "function" without building a
// value, any other value-use takes the canonical tuple (defaults, else Unknown), and a
// receiver-op callback specializes at the callback's type like an ordinary argument.
console.log(typeof box);
console.log(typeof f);
console.log(box);
console.log([1, 2, 3].map(box));

function take(x: unknown): string {
  return typeof x;
}
console.log(take(box));
console.log(take(f));
