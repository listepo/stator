// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: Functions, mixed-graph boundaries
// An unknown value returned where a fixed object type is declared is the checker's TS2322,
// and ts mode keeps the refusal: trusting the annotation without a check is exactly what the
// boundary rule forbids (plan.md §8 step 45). js mode widens the call instead
// (subset_return_boundary_js).

declare const u: unknown;
function f(): { x: number } { return u; }
console.log(f().x);
