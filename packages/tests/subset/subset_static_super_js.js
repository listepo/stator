// @mode: js
// @verdict: static
// SUBSET.md: Static methods and static class members

class B {
  static id = 'B';
  static m() {
    return `B:${this.id}`;
  }
}
class D extends B {
  static id = 'D';
  static m() {
    return `D>${super.m()}`;
  }
}
console.log(D.m());
