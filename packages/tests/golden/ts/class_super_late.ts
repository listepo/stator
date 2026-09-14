// plan.md §8 step 12(d): a derived constructor that validates before `super(...)`.
// Pre-super statements may not touch the receiver; initializers run after the call.

class B {
  n: number;
  m: number = 10;
  constructor(n: number) {
    this.n = n;
  }
}

class D extends B {
  doubled = 0;
  constructor(n: number) {
    const m = n * 2;
    if (m < 0) {
      throw new Error("neg");
    }
    super(m);
    this.doubled = this.n * 2;
  }
}

const d = new D(21);
console.log(d.n);
console.log(d.m);
console.log(d.doubled);
