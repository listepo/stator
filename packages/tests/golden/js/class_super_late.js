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

// plan.md §8 step 12(d), plan-notes 277: with no field initializers to splice, `super(...)`
// may sit in `if`/`else` arms — one call per path, every path covered, no reads before it.
class A {
  constructor(x) {
    this.x = x;
  }
}
class E extends A {
  constructor(flag, v) {
    if (flag) {
      super(v);
    } else {
      super(v * 2);
    }
  }
}
console.log(new E(true, 21).x);
console.log(new E(false, 21).x);
