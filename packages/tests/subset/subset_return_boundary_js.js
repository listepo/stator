// @mode: js
// @verdict: dynamic
// SUBSET.md: Functions, mixed-graph boundaries
// A dynamic value returned where a fixed object type is declared widens the CALL, not the
// declaration: the function keeps its typed signature (see `explain` below) while every call
// result answers Unknown, so uses route through the shape table (plan.md §8 step 45). ts mode
// keeps the checker's own refusal (subset_return_boundary_ts).

/** @returns {{x: number}} */
function f() { return JSON.parse('{"x":1}'); }
console.log(f().x);
