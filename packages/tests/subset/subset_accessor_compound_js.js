// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Classes with getters/setters

class C {
  constructor() {
    this.val = 0;
  }
  get value() {
    return this.val;
  }
  set value(v) {
    this.val = v;
  }
}
const c = new C();
c.value += 1;
export const x = c.value;
