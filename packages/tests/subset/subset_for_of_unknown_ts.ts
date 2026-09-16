// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: for-of over an unknown iterable (plan.md §8 step 2a(c), TS2488)
// The same program js mode answers dynamically: iterating a value with no static walk is a
// runtime question there, while ts mode keeps the checker's refusal. (An `unknown`-annotated
// operand refuses as STA1003 instead -- the binding it yields is implicit-any -- so this pins
// the 2488 path with a concretely-typed non-iterable.)
function each(o: number): void {
  for (const x of o) {
    console.log(x);
  }
}
each(5);
