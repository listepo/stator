// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: Spread operator ... in array literals (plan.md §8 step 2a(c) wake)
// The same source js mode carries to the lowering's precise STA1214: spreading a value with
// no static key set to expand is step 12(c) residue, while ts mode keeps the checker's own
// refusal unsuppressed.
function f(u: unknown): unknown[] {
  return [...u];
}
console.log(f([1, 2]));
