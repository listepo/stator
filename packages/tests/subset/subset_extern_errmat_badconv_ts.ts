// @mode: ts
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — misspelled `@statorError` convention (docs/FFI.md section 4). The set is
// closed (nonzero, negative, null, errno); `nonzeroe` is not a member, and silently reading
// it as "no convention" would discard the failure the author meant to surface — the gate
// refuses it at the declaration (`classifyExternDeclaration`,
// packages/compiler/src/frontend/extern.ts).
/// <reference path="./helper_extern_errmat_badconv.d.ts" />

console.log(extErrmatBadconv(0));
export {};
