// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Class member signatures (overloads, abstract and optional members, `super(...)` placement)
// A `super(...)` in a loop runs zero or several times, so there is no one place for the field
// initializers to follow (plan-notes 233).

class Base {
  n: number;
  constructor(n: number) {
    this.n = n;
  }
}
class Derived extends Base {
  constructor(times: number) {
    for (let i = 0; i < times; i++) {
      super(i);
    }
  }
}
export const x = new Derived(1).n;
