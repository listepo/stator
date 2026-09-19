// @mode: ts
// @verdict: error
// @code: STA1118
// SUBSET.md: FFI — overloaded extern resolves to the FIRST marked declaration (extern.ts
// externDeclarationOfSymbol; docs/FFI.md section 1 rule 4). Both declarations live in
// helper_extern_overload.d.ts, and the declaration walk reports every bad signature where
// it is written — so the second overload, wearing a bare `string` that earns STA1118 on
// its own, decides the file's verdict even though the call matches the first overload and
// the call-site arm never classifies it.
/// <reference path="./helper_extern_overload.d.ts" />

console.log(cPick(1));
export {};
