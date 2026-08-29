// @mode: js
// @verdict: not-yet
// @code: STA1206
// @expected-fail: true
// SUBSET.md: new Function()

const f = new Function("return 42");
export { f };
