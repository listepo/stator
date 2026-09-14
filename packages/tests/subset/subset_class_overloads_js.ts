// @mode: js
// @verdict: dynamic
// SUBSET.md: Classes with getters/setters
// The same overload surface in js mode: union-typed signatures lower to the dynamic
// representation, and the implementation still runs.

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
}

const c = new C("a");
export const x = new C(2).n + c.n + c.m(7);
