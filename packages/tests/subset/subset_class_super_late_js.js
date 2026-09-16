// @mode: js
// @verdict: dynamic
// SUBSET.md: Class inheritance, super calls, instance methods
// A derived constructor may validate and transform its parameters before `super(...)`, which
// stays a top-level statement. Field initializers run after the call, wherever it stands.

class B {
  constructor(n) {
    this.n = n;
  }
}

class D extends B {
  constructor(n) {
    const m = n * 2;
    super(m);
    this.doubled = this.n * 2;
  }
}

const d = new D(21);
export const x = d.n + d.doubled;

// A class with no field initializers may call `super(...)` in `if`/`else` arms instead:
// there is nothing to splice after the call (plan.md §8 step 12(d), plan-notes 277).
class E extends B {
  constructor(flag, n) {
    if (flag) {
      super(n);
    } else {
      super(n * 2);
    }
  }
}

const e = new E(true, 21);
export const y = e.n + new E(false, 21).n;
