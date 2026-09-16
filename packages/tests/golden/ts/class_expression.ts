// plan.md §8 step 12(d): bound class expressions. The formation emits the descriptor
// under the variable's name and binds no value; every in-place use erases to it.
const C = class D {
  v: number = 3;
  inner(): number {
    return new D().v;
  }
  static s: number = 9;
  static sm(): number {
    return C.s + 1;
  }
};
console.log(new C().inner());
console.log(C.s);
console.log(C.sm());
console.log(new C() instanceof C);
console.log(new C());

class B {
  b: number = 1;
  m(): number {
    return this.b;
  }
}
const Sub = class extends B {
  override m(): number {
    return super.m() + 10;
  }
};
console.log(new Sub().m());
console.log(new Sub() instanceof B);
console.log(new Sub() instanceof Sub);

class E extends C {
  ew(): number {
    return this.v * 2;
  }
}
console.log(new E().ew());
console.log(new E() instanceof C);
