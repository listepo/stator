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
