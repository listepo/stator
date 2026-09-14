// Generic arrows and function expressions (plan.md §8 step 12(f)): assigned to a
// top-level `const`, each call specializes under the variable's name.

const id = <T,>(x: T): T => x;
console.log(id(1));
console.log(id("a"));

const wrap = function <T>(x: T): T[] {
  return [x];
};
console.log(wrap(2).length);
console.log(wrap("b").length);

const len = <T extends { length: number }>(x: T): number => x.length;
console.log(len("abc"));
console.log(len([1, 2]));
