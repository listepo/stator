// @mode: js
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: Getters/setters on object literals

export const obj = {
  val: 0,
  get value() {
    return this.val;
  },
  set value(v) {
    this.val = v;
  }
};
