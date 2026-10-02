// @mode: js
// @verdict: dynamic
// SUBSET.md: FFI — `Uint8Array` parameter fed a dynamically-typed value (docs/FFI.md sections
// 2 and 5). The value gets `jsrt_check_uint8array` at the call (STA2001 on a non-view) before
// the emitter reads the view's layout, and the check is what makes the file dynamic.
/// <reference path="./helper_extern_bytes.d.ts" />

function identity(v) {
  return v;
}
console.log(extSum(identity(new Uint8Array(4))));
