// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Globals: the global object

// A global the compiler does not model is a not-yet naming Phase 4, not an internal error. The
// gate's accept set has to equal what the lowering can build a binding for, and the lowering binds
// only declarations it lowers -- `String` is declared in lib.es5.d.ts and has no body.
const text = String(1);
console.log(text);
