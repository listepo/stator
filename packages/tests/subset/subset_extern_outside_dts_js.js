// @mode: js
// @verdict: error
// @code: STA1121
// SUBSET.md: FFI — extern marker outside a `.d.ts` (docs/FFI.md section 1.3). The marker
// below sits in a `.js` file, which IS the violation; it stays inline by design — moving it
// into a helper would dissolve the fixture.
/** @statorExtern
 * @param {number} x
 * @returns {number}
 */
function cDoubleJs(x) {
  return x + x;
}

console.log(cDoubleJs(21));
