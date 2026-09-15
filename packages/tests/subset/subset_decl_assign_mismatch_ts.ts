// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: Declarations, mixed-graph boundaries
// The same edge js mode compiles to a catchable TypeError: assigning `unknown` to
// an annotated binding stays a passthrough refusal in ts mode (plan.md §8 step 45).
declare const u: unknown;
const bad: { a: number } = u;
try {
  console.log(bad.a);
} catch {
  console.log('threw');
}
