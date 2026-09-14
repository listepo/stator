// plan.md §8 step 12(d): a derived constructor that validates before `super(...)`.

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
console.log(d.n);
console.log(d.doubled);
