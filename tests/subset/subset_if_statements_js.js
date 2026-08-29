// @mode: js
// @verdict: static
// @expected-fail: true
// SUBSET.md: if statements

function test(x) {
  if (x > 0) {
    return x;
  } else {
    return -x;
  }
}
export { test };
