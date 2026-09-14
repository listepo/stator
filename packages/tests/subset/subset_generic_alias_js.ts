// @mode: js
// @verdict: static
// SUBSET.md: Generics — a generic aliased through `const` specializes at each call through
// the alias, under the declaration's name: the alias itself binds no value.

function box<T>(x: T): T {
  return x;
}
const f = box;
console.log(f(5));
console.log(f("t"));

const g = f;
console.log(g(6));

const id = <T,>(x: T): T => x;
const j = id;
console.log(j(7));
