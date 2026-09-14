// plan.md §8 step 12(d): same-kind shadowing in js mode.

class B {
  x;
  static n = 10;
  constructor() {
    this.x = 1;
  }
  static m() {
    return 100;
  }
}

class D extends B {
  x;
  static n = 20;
  constructor() {
    super();
    this.x = 2;
  }
  static m() {
    return 200;
  }
}

const d = new D();
console.log(d.x);
console.log(D.n);
console.log(B.n);
console.log(D.m());
console.log(B.m());
