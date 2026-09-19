// Shared declarations for the subset_extern_overload_{ts,js} decision fixtures (docs/FFI.md
// section 1 rule 4): an overloaded extern resolves to the FIRST marked declaration.
// The second overload wears a bare `string` that earns STA1118 on its own — the
// declaration walk reports every bad signature where it is written, so the file's
// verdict is that refusal, not the call site's. Kept apart from helper_extern_ffi.d.ts:
// one file, one verdict family (cf. helper_extern_ptrret.d.ts). The C symbol never
// needs to exist: decision fixtures run `explain`, never a link.

/** @statorExtern */
declare function cPick(x: number): number;

/** @statorExtern */
declare function cPick(x: string): number;
