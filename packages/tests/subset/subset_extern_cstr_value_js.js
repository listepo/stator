// @mode: js
// @verdict: static
// SUBSET.md: FFI — a `CString` value is a string (docs/FFI.md section 3, plan-notes 311). The
// JSDoc spelling of the ts fixture: the binding and the arrow take the extern's `CString`.
/// <reference path="./helper_extern_cstr.d.ts" />

/**
 * @param {number} count
 * @param {(index: number) => string} at
 * @returns {string}
 */
function join(count, at) {
  let out = '';
  for (let i = 0; i < count; i++) {
    out += at(i);
  }
  return out;
}

const echoed = cEcho('hello');
console.log(echoed, join(2, (i) => cEcho(`${i}`)));
