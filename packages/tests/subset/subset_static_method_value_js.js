// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Static methods and static class members

class S {
  static v = 5;
  static m() {
    return this.v;
  }
}
const f = S.m;
console.log(f());
