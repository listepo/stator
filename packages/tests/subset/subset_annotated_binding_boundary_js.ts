// @mode: js
// @verdict: dynamic
// SUBSET.md: A `.js` value reaching an annotated `.ts` binding, parameter or return of another type
// The checker's TS2322 (`string` is not assignable to `number`) is suppressed in js mode, but the
// `.ts` annotation is kept: the declaration edge gets a boundary check, and the emitted program
// raises STA2001 at the declaration instead of binding a string as a `number` (golden rule 4,
// plan-notes 301). ts mode keeps the refusal (subset_annotated_binding_boundary_ts).

import { label } from "./annotated_binding_helper_js.js";
const n: number = label(10);
console.log(n);
