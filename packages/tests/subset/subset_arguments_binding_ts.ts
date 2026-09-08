// @mode: ts
// @verdict: error
// @code: STA1105
// @expected-fail: true
// SUBSET.md: arguments binding

function f() {
  const a = arguments[0];
  return a;
}
export { f };
