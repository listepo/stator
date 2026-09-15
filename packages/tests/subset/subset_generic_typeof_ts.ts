// @mode: ts
// @verdict: static
// SUBSET.md: Generics — `typeof` a generic answers "function" for every specialization,
// so it folds to the literal without building a value — through an alias too.

function box<T>(x: T): T {
  return x;
}
const f = box;
console.log(typeof box);
console.log(typeof f);
