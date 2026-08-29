// @mode: js
// @verdict: not-yet
// @code: STA1207
// @expected-fail: true
// SUBSET.md: import() dynamic import

const m = import("./helper_js.js");
export { m };
