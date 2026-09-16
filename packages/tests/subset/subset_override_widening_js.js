// @mode: js
// @verdict: static
// SUBSET.md: Method overriding and super.method()
// An INFERRED override that narrows the return type is legal JavaScript: the checker infers
// `() => string` for the base and `() => number` for the override, js mode drops the TS2416
// refusal (plan-notes 274), and calls resolving to either declaration widen to Unknown —
// which the export edge settles with a tag check, so the file stays `static` (a virtual call
// plus a check, no shape table). An annotated disagreement on either side, or a
// field/accessor pair, keeps STA0012 (plan-notes 68/272).

class A {
  m() {
    return 'x';
  }
}
class B extends A {
  m() {
    return 1;
  }
}
export const b = new B().m();
