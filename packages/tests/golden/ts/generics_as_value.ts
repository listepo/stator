// Generic as-value (plan.md §8 step 12(f)): aliases specialize at each call under the
// declaration's name, and arguments specialize at the parameter's function type.

function box<T>(x: T): T {
  return x;
}
const f = box;
console.log(f(1));
console.log(f("a"));

const g = f;
console.log(g(2));

function run(cb: (x: number) => number, v: number): number {
  return cb(v);
}
console.log(run(box, 3));
console.log(run(f, 4));

function wrap<U>(cb: (x: U) => U, v: U): U {
  return cb(v);
}
console.log(wrap(box, 5));

const id = <T,>(x: T): T => x;
const j = id;
console.log(j(6));

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
