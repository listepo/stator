// @mode: js
// @verdict: dynamic
// SUBSET.md: FFI — extern call with a dynamically-typed argument (docs/FFI.md section 5:
// dynamic + unchecked-boundary flag). The unknown value gets a boundary check at the call
// (STA2001 on mismatch) and the check is what makes the file dynamic.
/// <reference path="./helper_extern_direct.d.ts" />

function identity(v) {
  return v;
}
console.log(extSqrt(identity(9)));
