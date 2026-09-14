// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: rest parameters (call-side spread needs a dynamic argv)
class C {
  m(a: number, b: number): number {
    return a + b;
  }
}
const c = new C();
const t: [number, number] = [1, 2];
console.log(c.m(...t));
class D {
  constructor(a: number, b: number) {
    console.log(a + b);
  }
}
const d = new D(...t);
console.log(d instanceof D);
