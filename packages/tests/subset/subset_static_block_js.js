// @mode: js
// @verdict: static
// SUBSET.md: Static methods and static class members
// A static block runs at class-definition time against the statics, which are plain bindings
// initialized where the class declaration sits. Fields after a block initialize in source
// order after it ran (plan.md §8 step 12(d), plan-notes 276): `D.b` observes the block's
// write to `D.a`.

class C {
  static n = 1;
  static m = 10;
  static {
    C.n = 2;
    C.m = C.n * 5;
  }
}
export const x = C.n + C.m;

class D {
  static a = 1;
  static {
    D.a = D.a + 1;
  }
  static b = D.a * 10;
}
export const y = D.a + D.b;
