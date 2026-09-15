// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: Declarations, mixed-graph boundaries
// The same edge js mode answers dynamically: assigning `unknown` to an annotated
// binding stays a passthrough refusal in ts mode (plan.md §8 step 45).
declare const u: unknown;
const x: { a: number } = u;
console.log(x.a);
