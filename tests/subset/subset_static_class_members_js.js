// @mode: js
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: Static methods and static class members

class C {
  static value;
}
export const v = C.value;
