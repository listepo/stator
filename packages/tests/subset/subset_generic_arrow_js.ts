// @mode: js
// @verdict: static
// SUBSET.md: Generics — a generic arrow or function expression assigned to a top-level
// `const` specializes under the variable's name, like a declaration under its own.

const id = <T,>(x: T): T => x;
console.log(id(2));
console.log(id("b"));

const wrap = function <T>(x: T): T[] {
  return [x];
};
console.log(wrap(3).length);

const len = <T extends { length: number }>(x: T): number => x.length;
console.log(len("xy"));
