// @mode: ts
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — a @statorLink pragma in a file with no @statorExtern declaration
// (docs/FFI.md section 9). Flags belong to the binding they link: a stray pragma is refused
// where it is written, never linked silently and never dropped silently.
/// <reference path="./helper_extern_link_noextern.d.ts" />

console.log(1);
export {};
