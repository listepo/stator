// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: rest parameters (call-side spread needs a dynamic argv)
function f(a, b) {
  return a + b;
}
const arr = [1, 2];
console.log(f(...arr));
