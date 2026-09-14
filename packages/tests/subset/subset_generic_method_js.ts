// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Generics — a generic method has no per-tuple body to live in: a method shares
// one dispatch slot across every tuple, so value-mentioning method type parameters stay
// not-yet (a parameter the method never mentions in a type position compiles today).

class C {
  m<T>(x: T): T {
    return x;
  }
}
const c = new C();
console.log(c.m(1));
