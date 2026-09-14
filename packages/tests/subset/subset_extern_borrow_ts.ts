// @mode: ts
// @verdict: not-yet
// @code: STA1217
// SUBSET.md: FFI — branded-pointer parameter forwarded through a binding (docs/FFI.md
// section 2 `T*` row). The gate classifies the DECLARED signature, not the call-site shape
// (extern.ts classifyExternDeclaration), so a local of brand type defers exactly like an
// inline literal: step 6's per-signature ownership is still missing.
/// <reference path="./helper_extern_ptr.d.ts" />

const db: sqlite3 = { __brand: "sqlite3" } as sqlite3;
console.log(extDbVersion(db));
export {};
