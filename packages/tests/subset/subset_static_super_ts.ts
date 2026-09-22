// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Static methods and static class members
// `super.m()` in a static starts the lookup at the base and keeps `this` as the receiver.

class B {
  static id = 'B';
  static m(): string {
    return `B:${this.id}`;
  }
}
class D extends B {
  static override id = 'D';
  static override m(): string {
    return `D>${super.m()}`;
  }
}
console.log(D.m());
