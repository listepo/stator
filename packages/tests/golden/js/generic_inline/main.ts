// js-mode twin of `ts/generic_inline.ts`.

console.log([1, 2].map(<T>(x: T): T => x));

function run(f: (x: number) => number, v: number): number {
  return f(v);
}
console.log(run(<T>(x: T): T => x, 5));
console.log(run(function twice<T>(x: T): number {
  return (x as unknown as number) * 2;
}, 21));

function f(): number[] {
  return [3, 4].map(<T>(x: T): T => x);
}
console.log(f());

function outer<T>(x: T): T[] {
  return [x].map(<U>(y: U): U => y);
}
console.log(outer(7));
console.log(outer("s"));

const len = <T extends { length: number }>(x: T): number => x.length;
console.log(len("abc"));
console.log(run(<T extends number>(x: T): number => x, 9));

function dbl(n: number): number {
  return n * 2;
}
console.log([1, 2].map(<T>(x: T): number => dbl(x as unknown as number)));
console.log([5].map(<T>(x: T): number => (console.log("in"), x as unknown as number)));
