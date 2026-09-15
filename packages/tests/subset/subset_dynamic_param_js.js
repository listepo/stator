// @mode: js
// @verdict: dynamic
// SUBSET.md: Functions, mixed-graph boundaries
// A dynamic value reaching a fixed-shape parameter widens the parameter to Unknown, so the
// function goes dynamic rather than reading a slot out of a shape-table value (plan.md
// §8 step 44c). ts mode keeps the checker's own refusal (subset_dynamic_param_ts).

/** @param {{x: number}} o */
function getX(o) {
  return o.x;
}
console.log(getX(JSON.parse('{"x": 42}')));
