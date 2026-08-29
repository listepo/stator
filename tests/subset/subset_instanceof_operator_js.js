// @mode: js
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: instanceof operator

class C {}
const x = new C();
const b = x instanceof C;
export { b };
