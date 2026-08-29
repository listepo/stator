// @mode: ts
// @verdict: not-yet
// @code: STA1207
// @expected-fail: true
// SUBSET.md: import() dynamic import

const m = import("./helper_ts.ts");
export { m };
