// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Static methods and static class members

class C {
  static n = 1;
  static {
    C.n = 2;
  }
}
console.log(C.n);
