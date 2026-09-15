// @mode: js
// @verdict: dynamic
// SUBSET.md: Assignment, mixed-graph boundaries
// Reassigning a fixed-shape binding with a dynamic value widens it to Unknown,
// so later reads go through the shape table (plan.md §8 step 45). ts mode keeps
// the checker's own refusal (subset_decl_assign_reassign_ts).
/** @type {{a: number}} */
let o = { a: 0 };
o = JSON.parse('{"a":2}');
console.log(o.a);
