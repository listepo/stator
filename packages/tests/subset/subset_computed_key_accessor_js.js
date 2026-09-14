// @mode: js
// @verdict: dynamic
// SUBSET.md: Object literals with optional properties, index signatures
// An accessor beside a runtime-computed key installs its pair in the dynamic object's slot,
// like an accessor on any other dynamic literal (plan.md §8 step 22).

export function build(k) {
  const o = { [k]: 2, get x() { return 3; } };
  console.log(o.x);
}
