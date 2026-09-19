// @mode: ts
// @verdict: not-yet
// SUBSET.md: Static methods and static class members
// `this` in a static is the class it was reached through; the lowering names it per receiver.

class S {
  static v = 5;
  static m(): number {
    return this.v * 2;
  }
}
class T extends S {
  static override v = 10;
}
console.log(`${S.m()} ${T.m()}`);
