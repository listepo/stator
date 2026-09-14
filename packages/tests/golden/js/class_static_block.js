// plan.md §8 step 12(d): static initialization blocks in js mode.

class C {
  static n = 1;
  static {
    C.n = 2;
    if (C.n > 1) {
      C.n += 100;
    }
  }
}

console.log(C.n);
