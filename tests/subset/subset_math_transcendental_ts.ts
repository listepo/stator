// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Math (exactly-specified operations)
// sin is implementation-approximated: Node's answer comes from V8's fdlibm and the host libm may
// differ in the last ulp, so it waits on vendoring fdlibm rather than golden tests that depend on
// whichever libm built the runtime.

export const x = Math.sin(1);
