// @mode: js
// @verdict: error
// @code: STA1112
// @expected-fail: true
// SUBSET.md: Decorators

function dec() {}
class C {
  x = 42;
}
export { C };
