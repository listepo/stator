// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: Declarations, mixed-graph boundaries
// The same combination js mode answers dynamically: returning `unknown` where a fixed
// object type is declared stays a passthrough refusal in ts mode, so the build stops
// before the declaration edge is ever asked (plan.md §8 step 46).
declare const u: unknown;
function f(): { x: number } { return u; }
const y: { x: number } = f();
console.log(y.x);
