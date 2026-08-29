// @mode: js
// @verdict: static
// SUBSET.md: Generics

function box<T>(item: T): T {
  return item;
}
console.log(box(42));
console.log(box("x"));
