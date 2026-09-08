// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Classes with getters/setters
// `o.x += 1` is a get AND a set of one property. The machinery that evaluates a receiver exactly
// once across a read-modify-write hoists a SLOT, which an accessor is not.

class C {
  val: number = 0;
  get value(): number {
    return this.val;
  }
  set value(v: number) {
    this.val = v;
  }
}
const c = new C();
c.value += 1;
export const x = c.value;
