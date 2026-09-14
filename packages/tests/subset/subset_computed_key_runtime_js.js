// @mode: js
// @verdict: dynamic
// SUBSET.md: Object literals with optional properties, index signatures
// A computed key of non-literal type is a runtime value, so the literal builds a dynamic
// object and the read resolves through the shape table (plan.md §8 step 22).

export function build(k) {
  const o = { [k]: 2 };
  console.log(o[k]);
}
