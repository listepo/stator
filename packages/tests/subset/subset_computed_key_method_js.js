// @mode: js
// @verdict: dynamic
// SUBSET.md: Object literals with optional properties, index signatures
// A method beside a runtime-computed key lives on the dynamic object as an own data property
// holding the method's closure, and the call passes the receiver through the shape table
// (plan.md §8 step 22).

export function build(k) {
  const o = { [k]: 2, m() { return 1; } };
  console.log(o.m());
}
