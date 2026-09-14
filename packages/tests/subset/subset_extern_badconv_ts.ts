// @mode: ts
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — misspelled `@statorError` convention (docs/FFI.md section 4). The set is
// closed (nonzero, negative, null, errno); `non-zero` is not a member, and silently reading
// it as "no convention" would discard the failure the author meant to surface.
/// <reference path="./helper_extern_badconv.d.ts" />

console.log(extTypo(0));
export {};
