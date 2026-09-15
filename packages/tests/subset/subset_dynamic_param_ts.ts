// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: Functions, mixed-graph boundaries
// A dynamic value reaching a fixed-shape parameter is the checker's TS2345, and ts mode keeps
// the refusal: trusting the annotation without a check is exactly what the boundary rule
// forbids (plan.md §8 step 44c). js mode widens the parameter instead
// (subset_dynamic_param_js).

function getX(o: { x: number }): number {
  return o.x;
}
declare const u: unknown;
console.log(getX(u));
