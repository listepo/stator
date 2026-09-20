// @mode: js
// @verdict: static
// SUBSET.md: Static methods and static class members
// A static block runs at class-definition time against the statics, which are plain bindings
// initialized where the class declaration sits.

class C {
  static n = 1;
  static m = 10;
  static {
    C.n = 2;
    C.m = C.n * 5;
  }
}
export const x = C.n + C.m;
