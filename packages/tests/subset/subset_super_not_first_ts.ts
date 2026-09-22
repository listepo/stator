// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Class member signatures (overloads, abstract and optional members, `super(...)` placement)
// A derived constructor may run code before `super(...)` and may call it in both branches of an
// if/else: the field initializers follow the call wherever it sits (plan-notes 233).

class Base {
  n: number;
  constructor(n: number) {
    this.n = n;
  }
}
class Derived extends Base {
  doubled = this.n * 2;
  constructor(n: number, twice: boolean) {
    const start = n + 1;
    if (twice) {
      super(start * 2);
    } else {
      super(start);
    }
  }
}
export const x = new Derived(1, true).doubled;
