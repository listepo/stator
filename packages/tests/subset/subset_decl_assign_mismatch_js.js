// @mode: js
// @verdict: dynamic
// SUBSET.md: Declarations, mixed-graph boundaries
// A nullish mismatch on the declaration edge compiles and throws Node's catchable
// TypeError off the dynamic read (plan.md §8 step 45). ts mode keeps the checker's
// own refusal (subset_decl_assign_mismatch_ts).
/** @type {{a: number}} */
const bad = JSON.parse('null');
try {
  console.log(bad.a);
} catch {
  console.log('threw');
}
