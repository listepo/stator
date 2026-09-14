// @mode: js
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — misspelled `@statorError` convention (docs/FFI.md section 4), called from
// untyped code. The convention is a property of the DECLARATION, so the verdict is the same
// error in both modes.
// (`classifyExternDeclaration`, packages/compiler/src/frontend/extern.ts).
/// <reference path="./helper_extern_errmat_badconv.d.ts" />

console.log(extErrmatBadconv(0));
