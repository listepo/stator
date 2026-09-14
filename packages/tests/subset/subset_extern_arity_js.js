// @mode: js
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — extern call with the wrong argument count. A C call has no
// missing-means-`undefined` and no drop-extras, so the count is exact, permanently (never,
// not scheduled); the checker diagnostic this mirrors is suppressed in `js` mode, so the
// gate refuses it here (docs/FFI.md section 2 catch-all).
/// <reference path="./helper_extern_direct.d.ts" />

console.log(extSqrt(1, 2));
