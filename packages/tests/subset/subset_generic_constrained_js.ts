// @mode: js
// @verdict: static
// SUBSET.md: Generics — constrained type parameters specialize per concrete tuple;
// the checker enforces the constraint at every call site.

function len<T extends { length: number }>(x: T): number {
  return x.length;
}
console.log(len("xy"));
console.log(len([4, 5, 6, 7]));

function first<T extends unknown[]>(xs: T): number {
  return xs.length;
}
console.log(first(["q", "w"]));

function sum<T extends number[]>(xs: T): number {
  let total = 0;
  for (const v of xs) {
    total = total + v;
  }
  return total;
}
console.log(sum([4, 5]));

class Box {
  v: number = 0;
}
function read<T extends Box>(b: T): number {
  return b.v;
}
function write<T extends Box>(b: T): number {
  b.v = 10;
  b.v += 2;
  return b.v;
}
const bx = new Box();
console.log(read(bx));
console.log(write(bx));

function run<T extends (x: number) => number>(f: T): number {
  return f(40);
}
console.log(run((x) => x + 2));

function id<T extends string | number>(x: T): T {
  return x;
}
console.log(id("b"));
console.log(id(2));
