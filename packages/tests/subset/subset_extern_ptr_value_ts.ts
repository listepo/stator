// @mode: ts
// @verdict: not-yet
// @code: STA1217
// SUBSET.md: FFI — a handle-creating extern in value position (docs/FFI.md section 1). An
// extern has no VALUE to alias: borrowing one as a function value would retain the handle
// past the call it was borrowed for, and v0 has no transfer spelling — so the position stays
// not-yet rather than building a closure over a C symbol.
/// <reference path="./helper_extern_ptr.d.ts" />

const opener = extOpenDb;
console.log(typeof opener);
export {};
