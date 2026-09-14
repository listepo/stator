// @mode: ts
// @verdict: static
// SUBSET.md: Generics — a generic passed as an argument specializes at the parameter's
// function type, the only static description of how the value will be used.

function box<T>(x: T): T {
  return x;
}
function run(cb: (x: number) => number, v: number): number {
  return cb(v);
}
console.log(run(box, 1));

const f = box;
console.log(run(f, 2));

function wrap<U>(cb: (x: U) => U, v: U): U {
  return cb(v);
}
console.log(wrap(box, 3));
