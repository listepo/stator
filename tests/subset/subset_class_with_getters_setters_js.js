// @mode: js
// @verdict: dynamic
// SUBSET.md: Classes with getters/setters

class Value {
  constructor(start) {
    this.val = start;
  }
  get value() {
    return this.val;
  }
  set value(v) {
    this.val = v;
  }
}
const v = new Value(0);
v.value = 2;
export const x = v.value;
