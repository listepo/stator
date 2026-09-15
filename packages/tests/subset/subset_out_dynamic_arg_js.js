// @mode: js
// @verdict: error
// @code: STA1125
// SUBSET.md: FFI — Unknown-typed value passed to an Out<T> parameter (docs/FFI.md section 2).
// Unlike a T* read, an out-param WRITES through the pointer, so no boundary check can prove
// the address sound — the call is refused statically instead of guarded with STA2001.
// Declarations ride the shared helper.
/// <reference path="./helper_extern_out.d.ts" />

/**
 * @param {unknown} target
 */
function openInto(target) {
  fakeOpen("test.db", target);
}
openInto({ op: "open" });
