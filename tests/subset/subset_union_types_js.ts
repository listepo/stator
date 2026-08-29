// @mode: js
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: Union types

type Status = "ok" | "error";
export const s: Status = "ok";
