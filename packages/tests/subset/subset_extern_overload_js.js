// @mode: js
// @verdict: error
// @code: STA1118
// SUBSET.md: FFI — overloaded extern resolves to the first marked declaration. Both
// declarations (/** @statorExtern */ declare function cPick(x: number): number;
// /** @statorExtern */ declare function cPick(x: string): number;) live in
// helper_extern_overload.d.ts — the shared per-kind helper — and the declaration walk
// reports every bad signature where it is written, so the second overload, wearing a
// bare `string` that earns STA1118 on its own, decides the file's verdict even though
// the call matches the first overload.
/// <reference path="./helper_extern_overload.d.ts" />

console.log(cPick(1));
