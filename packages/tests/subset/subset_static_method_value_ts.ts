// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Static methods and static class members
// A static method that reads `this`, taken as a value, loses its receiver (Node throws reading
// `this.v` of undefined); the lowering has no receiver to give the detached function.

class S {
  static v = 5;
  static m(): number {
    return this.v;
  }
}
const f = S.m;
console.log(f());
