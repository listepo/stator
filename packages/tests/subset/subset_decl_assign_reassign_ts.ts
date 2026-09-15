// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: Assignment, mixed-graph boundaries
// The same edge js mode answers dynamically: assigning `unknown` into an annotated
// binding stays a passthrough refusal in ts mode (plan.md §8 step 45).
declare const u: unknown;
let o: { a: number } = { a: 0 };
o = u;
console.log(o.a);
