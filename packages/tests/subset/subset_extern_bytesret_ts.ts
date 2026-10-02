// @mode: ts
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — `Uint8Array` as an extern RETURN (docs/FFI.md section 2): the row is
// parameter-only, so the return is outside the table. A callee that produces bytes fills a view
// the caller passes in.
/// <reference path="./helper_extern_bytesret.d.ts" />

console.log(extMake(4));
export {};
