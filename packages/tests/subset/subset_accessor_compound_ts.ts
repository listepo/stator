// @mode: ts
// @verdict: static
// SUBSET.md: Classes with getters/setters
// `o.x += 1` is a get AND a set of one property. In statement position the member place
// machinery evaluates the receiver once into a temporary and threads it through both calls.

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
c.value++;
export const x = c.value;
