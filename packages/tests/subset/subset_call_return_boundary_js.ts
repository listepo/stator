// @mode: js
// @verdict: dynamic
// SUBSET.md: A `.js` value reaching an annotated `.ts` binding, parameter or return of another type
// The checker's TS2345 (a `string` argument for a `number` parameter) and TS2322 (a `string`
// returned from a `number` function) are suppressed in js mode, but each `.ts` annotation is
// kept: the call and return edges get boundary checks, and the emitted program raises STA2001 at
// the argument instead of running `inc` on a string (golden rule 4, plan-notes 307). ts mode keeps
// the refusal (subset_call_return_boundary_ts).

import { label } from "./annotated_binding_helper_js.js";
function inc(x: number): number {
  return x + 1;
}
function first(): number {
  return label(2);
}
console.log(inc(label(1)), first());
