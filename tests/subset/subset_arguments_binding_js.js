// @mode: js
// @verdict: not-yet
// @code: STA1202
// @expected-fail: true
// SUBSET.md: arguments binding

function f() {
  const a = arguments[0];
  return a;
}
export { f };
