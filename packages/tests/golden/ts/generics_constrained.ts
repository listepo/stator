// Constrained type parameters (plan.md §8 step 12(f)): the checker enforces the constraint
// at every call site, and each call specializes at its own concrete tuple.

function len<T extends { length: number }>(x: T): number {
  return x.length;
}
console.log(len("abc"));
console.log(len([1, 2, 3]));

function first<T extends unknown[]>(xs: T): number {
  return xs.length;
}
console.log(first([7, 8]));
console.log(first(["q"]));

function at0<T extends number[]>(xs: T): number {
  return xs[0] as number;
}
console.log(at0([9, 10]));

function sum<T extends number[]>(xs: T): number {
  let total = 0;
  for (const v of xs) {
    total = total + v;
  }
  return total;
}
console.log(sum([1, 2, 3]));

function run<T extends (x: number) => number>(f: T): number {
  return f(41);
}
console.log(run((x) => x + 1));

class Box {
  v: number = 0;
}
function read<T extends Box>(b: T): number {
  return b.v;
}
function write<T extends Box>(b: T): number {
  b.v = 42;
  b.v += 1;
  return b.v;
}
const bx = new Box();
console.log(read(bx));
console.log(write(bx));

function shout<T extends string>(s: T): string {
  return s.toUpperCase();
}
console.log(shout("hey"));

function id<T extends string | number>(x: T): T {
  return x;
}
console.log(id("a"));
console.log(id(1));
