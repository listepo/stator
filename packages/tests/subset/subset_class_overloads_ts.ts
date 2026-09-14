// @mode: ts
// @verdict: dynamic
// SUBSET.md: Classes with getters/setters
// Overload signatures declare nothing to emit: the implementation below runs, no matter which
// signature a caller resolves through. The union-typed implementation lowers to the dynamic
// representation, so the file is `dynamic`, not `static`.

class C {
  n: number;
  constructor(n: string);
  constructor(n: number);
  constructor(n: string | number) {
    this.n = typeof n === "number" ? n : 1;
  }
  m(x: string): string;
  m(x: number): number;
  m(x: string | number): string | number {
    return x;
  }
  static make(s: string): number;
  static make(n: number): number;
  static make(v: string | number): number {
    return typeof v === "number" ? v : 0;
  }
}

const c = new C("a");
export const x = new C(2).n + c.n + c.m(7) + C.make(9);
