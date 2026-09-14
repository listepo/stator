// js-mode twin of `ts/generics_constrained.ts`: a `.ts` file compiled under `--mode=js`
// gets the same specializations, because nothing below the mode gate knows the mode existed.

function len<T extends { length: number }>(x: T): number {
  return x.length;
}
console.log(len("xy"));
console.log(len([4, 5]));

function total<T extends number[]>(xs: T): number {
  let acc = 0;
  for (const v of xs) {
    acc = acc + v;
  }
  return acc;
}
console.log(total([4, 5, 6]));

class Crate {
  n: number = 1;
}
function getN<T extends Crate>(c: T): number {
  c.n += 10;
  return c.n;
}
console.log(getN(new Crate()));
