// @mode: ts
// @verdict: error
// @code: STA1112
// @expected-fail: true
// SUBSET.md: Decorators

function dec() {}
class C {
  @dec
  x: number = 42;
}
export { C };
