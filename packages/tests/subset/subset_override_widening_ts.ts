// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: Method overriding and super.method()
// ts mode keeps the refusal: an override incompatible with its base is a type error (TS2416),
// and js mode only drops it when the disagreement comes from inference (plan-notes 274) —
// here both types are checked, so the program is refused in the default mode.

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
