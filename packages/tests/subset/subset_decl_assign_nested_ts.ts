// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: Declarations, mixed-graph boundaries
// The same edge js mode answers dynamically: assigning `unknown` to a nested
// annotated binding stays a passthrough refusal in ts mode (plan.md §8 step 45).
declare const u: unknown;
const n: { a: { b: number } } = u;
console.log(n.a.b);
