// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Class member signatures (overloads, abstract and optional members, `super(...)` placement)
// The js-mode twin: code before `super(...)`, and the call in both branches of an if/else
// (plan-notes 233).

class Base {
  constructor(n) {
    this.n = n;
  }
}
class Derived extends Base {
  doubled = this.n * 2;
  constructor(n, twice) {
    const start = n + 1;
    if (twice) {
      super(start * 2);
    } else {
      super(start);
    }
  }
}
export const x = new Derived(1, true).doubled;
