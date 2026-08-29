// @mode: ts
// @verdict: static
// @expected-fail: true
// SUBSET.md: instanceof operator

class C {}
const x = new C();
const b: boolean = x instanceof C;
export { b };
