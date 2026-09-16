// @mode: js
// @verdict: static
// SUBSET.md: Static methods and static class members

class S {
  static v = 5;
  static m() {
    return this.v * 2;
  }
}
class T extends S {
  static v = 10;
}
console.log(`${S.m()} ${T.m()}`);
