// plan.md §8 step 12(d): bound class expressions. The formation emits the descriptor
// under the variable's name and binds no value; every in-place use erases to it.
const C = class D {
  v = 3;
  inner() {
    return new D().v;
  }
  static s = 9;
};
console.log(new C().inner());
console.log(C.s);
console.log(new C() instanceof C);

class B {
  constructor(n) {
    this.n = n;
  }
}
const Sub = class extends B {
  constructor(n) {
    super(n * 2);
  }
};
console.log(new Sub(21).n);
console.log(new Sub(21) instanceof B);
