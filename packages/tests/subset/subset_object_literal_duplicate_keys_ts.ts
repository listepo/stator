// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: Object literals with static keys
// Duplicate data-property keys are tsc's grammar check TS1117, and ts mode keeps the refusal:
// last-wins is JavaScript's answer, not typed TypeScript's (plan.md §8 step 26). js mode takes
// the value instead (subset_object_literal_duplicate_keys_js).

const a = { x: 1, x: 2 };
console.log(a.x);
