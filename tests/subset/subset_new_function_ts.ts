// @mode: ts
// @verdict: error
// @code: STA1103
// @expected-fail: true
// SUBSET.md: new Function()

const f = new Function("return 42");
export { f };
