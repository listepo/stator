// plan.md §8 step 12(d): overload signatures in js mode, union-typed.

class C {
  constructor(n) {
    this.n = typeof n === "number" ? n : 1;
  }
  m(x) {
    return x;
  }
}

const c = new C("a");
console.log(c.n);
console.log(new C(2).n);
console.log(c.m("a"));
console.log(c.m(7));
