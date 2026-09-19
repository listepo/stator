// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Modules -- a default import binds a name the exporting file does not own
// under that spelling (the export is anonymous), so name-based merging cannot honor it
// (plan.md §8 step 12(d); the anonymous default-export declaration stays STA1214 for
// the same reason). Named imports compile (subset_import_declarations_js).

import d from "./helper_js.js";
console.log(d);
