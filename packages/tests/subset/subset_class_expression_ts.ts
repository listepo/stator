// @mode: ts
// @verdict: static
// SUBSET.md: Classes -- a bound class expression (`const C = class …`) emits its descriptor
// under the variable's name and binds no value; every in-place use erases to the expression
// (plan.md §8 step 12(d), plan-notes 278). The inner name is visible in the class body only.

const C = class D {
  v: number = 3;
  inner(): number {
    return new D().v;
  }
  static s: number = 9;
};
class E extends C {
  override inner(): number {
    return super.inner() + C.s;
  }
}
export const a = new C().inner();
export const b = C.s;
export const c = new C() instanceof C;
export const d = new E().inner();
