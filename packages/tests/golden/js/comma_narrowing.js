// The comma operator's value is its right operand, typed as that operand (plan.md §11d T12.3).
// Rolldown's `__commonJSMin` assigns `mod` on the left and reads it on the right; the checker typed
// the whole expression from the declared binding instead, an internal STA4013.
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var require_two = __commonJSMin((exports) => {
  exports.two = 2;
});
console.log(require_two().two, require_two() === require_two());

function first(mod) {
  return (mod = { e: 1 }, mod.e);
}
console.log(first());
