// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Object namespace
// An all-required object literal is a FIXED shape: its reads compile to slot indices decided at
// build time, so a key `assign` added could never be read back. Refusing the write is the only
// sound answer short of deoptimizing every literal in the program into a shape table.

export const merged = Object.assign({ x: 1 }, { y: 2 });
