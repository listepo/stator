// @mode: ts
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: Classes with getters/setters

class Value {
  private val: number = 0;
  get value(): number {
    return this.val;
  }
  set value(v: number) {
    this.val = v;
  }
}
export const x = new Value();
