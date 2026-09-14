// @mode: ts
// @verdict: static
// @expected-fail: true
// SUBSET.md: FFI — overloaded extern resolves to the FIRST marked declaration (extern.ts
// externDeclarationOfSymbol). The call matches the first overload, so the second — wearing a
// bare `string` that would earn STA1118 on its own — is never classified. Until Task 7.1 step
// 10 extracts both declarations into helper_extern_ffi.d.ts, the inline markers answer
// STA1121 instead.
/** @statorExtern */
declare function cPick(x: number): number;
/** @statorExtern */
declare function cPick(x: string): number;

console.log(cPick(1));
export {};
