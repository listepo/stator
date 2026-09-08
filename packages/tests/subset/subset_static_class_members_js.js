// @mode: js
// @verdict: dynamic
// SUBSET.md: Static methods and static class members

class C {
  static value;
  static set(v) {
    C.value = v;
  }
}
C.set(3);
console.log(C.value);
