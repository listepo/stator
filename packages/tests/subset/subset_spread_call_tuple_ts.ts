// @mode: ts
// @verdict: dynamic
// SUBSET.md: rest parameters (call-side spread needs a dynamic argv)
// A tuple has no HIR type of its own, so its spread drains through the `...` row and the list
// is Unknown-typed (plan.md §11c T11.4 step 5).
function f(a: number, b: number): number {
  return a + b;
}
const t: [number, number] = [1, 2];
console.log(f(...t));
