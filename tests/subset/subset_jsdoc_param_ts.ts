// @mode: ts
// @verdict: error
// @code: STA1003
// The same source one rung earlier: TS8024 is only reported for .js files, so in ts mode what
// refuses this is Stator's own implicit-any rule, not the JSDoc tag.
// SUBSET.md: JSDoc param mismatch
/** @param {number} q */
function twice(n) {
  return n * 2;
}
console.log(twice(3));
