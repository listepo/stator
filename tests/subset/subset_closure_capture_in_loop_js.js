// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Function declarations, function expressions, arrow functions

// The per-iteration binding is a language rule, not a typing one, so js mode is held back on the
// same construct as ts mode -- see subset_closure_capture_in_loop_ts.ts.
function each() {
  for (let i = 0; i < 2; i++) {
    const show = function () {
      return i;
    };
    console.log(show());
  }
}
each();
