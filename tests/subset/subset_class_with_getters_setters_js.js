// @mode: js
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: Classes with getters/setters

class Value {
  get value() {
    return 0;
  }
  set value(v) {
  }
}
export const x = new Value();
