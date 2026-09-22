// @mode: js
// @verdict: static
// SUBSET.md: Classes -- a bound class expression (`const C = class …`) emits its descriptor
// under the variable's name and binds no value; every in-place use erases to the expression
// (plan.md §8 step 12(d), plan-notes 278). The inner name is visible in the class body only.

const C = class D {
  v = 3;
  inner() {
    return new D().v;
  }
  static s = 9;
};
class E extends C {
  m() {
    return this.v + C.s;
  }
}
export const a = new C().inner();
export const b = C.s;
export const c = new C() instanceof C;
export const d = new E().m();
