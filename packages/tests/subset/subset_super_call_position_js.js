// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Class member signatures (overloads, abstract and optional members, `super(...)` placement)
// The js-mode twin: a `super(...)` in a loop (plan-notes 233).

class Base {
  constructor(n) {
    this.n = n;
  }
}
class Derived extends Base {
  constructor(times) {
    for (let i = 0; i < times; i++) {
      super(i);
    }
  }
}
export const x = new Derived(1).n;
