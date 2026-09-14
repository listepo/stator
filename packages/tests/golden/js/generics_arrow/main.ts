// js-mode twin of `ts/generics_arrow.ts`.

const id = <T,>(x: T): T => x;
console.log(id(3));
console.log(id("c"));

const wrap = function <T>(x: T): T[] {
  return [x];
};
console.log(wrap(4).length);

const len = <T extends { length: number }>(x: T): number => x.length;
console.log(len("xy"));
