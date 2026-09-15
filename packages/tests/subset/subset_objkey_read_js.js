// @mode: js
// @verdict: dynamic
// SUBSET.md: Element access
// An object-typed key on a fixed shape coerces via ToPropertyKey and reads through the dynamic
// index path, so the file is dynamic (plan.md §8 step 44b). ts mode keeps the checker's own
// refusal (subset_objkey_read_ts).

const o = { a: 1 };
const k = {};
console.log(o[k]);
