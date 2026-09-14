// plan.md §8 step 12(d): static initialization blocks.
// Blocks run where the class declaration sits, after every static initialized, with control
// flow and block-local bindings.

class C {
  static n = 1;
  static m = 10;
  static {
    C.n = 2;
    C.m = C.n * 5;
    if (C.m > 5) {
      C.n += 100;
    }
    let doubled = C.m * 2;
    C.m = doubled;
  }
  static {
    C.n += 1000;
  }
}

console.log(C.n);
console.log(C.m);

function make(k: number): number {
  class D {
    static v = k;
    static {
      D.v = D.v * 2;
    }
  }
  return D.v;
}
console.log(make(21));
