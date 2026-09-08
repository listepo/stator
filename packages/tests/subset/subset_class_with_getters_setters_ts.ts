// @mode: ts
// @verdict: static
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
const v = new Value();
v.value = 2;
export const x = v.value;
