// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: rest parameters (call-side spread needs a dynamic argv)
// The spread lowering builds no optional chain's short-circuit (plan.md §11c T11.4 step 5).
const o = { f: (a, b) => a + b };
console.log(o.f?.(...[1, 2]));
