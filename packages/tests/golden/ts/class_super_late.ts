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

// plan.md §8 step 12(d), plan-notes 277: with no field initializers to splice, `super(...)`
// may sit in `if`/`else` arms — one call per path, every path covered, no reads before it.
class A {
  x: number;
  constructor(x: number) {
    this.x = x;
  }
}
class E extends A {
  constructor(flag: boolean, v: number) {
    if (flag) {
      super(v);
    } else {
      super(v * 2);
    }
  }
}
class F extends A {
  y: number;
  constructor(n: number) {
    if (n > 0) {
      if (n > 10) {
        super(n);
      } else {
        super(-n);
      }
    } else if (n < 0) {
      super(n * 2);
    } else {
      super(0);
    }
    this.y = this.x + 1;
  }
}
console.log(new E(true, 21).x);
console.log(new E(false, 21).x);
console.log(new F(21).y);
console.log(new F(5).y);
console.log(new F(-21).y);
console.log(new F(0).y);

// plan.md §8 step 12(d): the `switch` twin of the arm rule — one call per path through the
// clauses, `default` covering the unmatched path, grouped cases sharing one call. A `case`
// that falls through into another `super(...)` would re-run the base and is refused.
class G extends A {
  z: number;
  constructor(x: number) {
    switch (x) {
      case 1:
        super(1);
        break;
      case 2:
      case 3:
        super(x * 10);
        break;
      default:
        super(0);
    }
    this.z = this.x + 1;
  }
}
class H extends A {
  constructor(n: number) {
    if (n > 0) {
      switch (n) {
        case 1:
          super(1);
          break;
        default:
          super(n);
      }
    } else if (n < 0) {
      super(n);
    } else {
      super(0);
    }
  }
}
console.log(new G(1).z);
console.log(new G(2).z);
console.log(new G(3).z);
console.log(new G(9).z);
console.log(new H(1).x);
console.log(new H(5).x);
console.log(new H(-5).x);
console.log(new H(0).x);
