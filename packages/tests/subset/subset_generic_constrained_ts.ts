// @mode: ts
// @verdict: static
// SUBSET.md: Generics — constrained type parameters specialize per concrete tuple;
// the checker enforces the constraint at every call site.

function len<T extends { length: number }>(x: T): number {
  return x.length;
}
console.log(len("abc"));
console.log(len([1, 2, 3]));

function first<T extends unknown[]>(xs: T): number {
  return xs.length;
}
console.log(first([7, 8]));

function sum<T extends number[]>(xs: T): number {
  let total = 0;
  for (const v of xs) {
    total = total + v;
  }
  return total;
}
console.log(sum([1, 2, 3]));

class Box {
  v: number = 0;
}
function read<T extends Box>(b: T): number {
  return b.v;
}
function write<T extends Box>(b: T): number {
  b.v = 41;
  b.v += 1;
  return b.v;
}
const bx = new Box();
console.log(read(bx));
console.log(write(bx));

function run<T extends (x: number) => number>(f: T): number {
  return f(41);
}
console.log(run((x) => x + 1));

function id<T extends string | number>(x: T): T {
  return x;
}
console.log(id("a"));
console.log(id(1));
