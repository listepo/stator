// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Static methods and static class members

class S {
  static count = 0;
}
class T extends S {}
T.count = 5;
console.log(S.count, T.count);
