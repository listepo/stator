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
