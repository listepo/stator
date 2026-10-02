// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: rest parameters (call-side spread needs a dynamic argv)
// `super(...args)` binds the receiver a constructor call builds, which the spread call does not
// pass; it waits with the spread `new` (plan.md §11c T11.4 step 5).
class A {
  s: number;
  constructor(a: number, b: number) {
    this.s = a + b;
  }
}
class B extends A {
  constructor(...args: [number, number]) {
    super(...args);
  }
}
console.log(new B(1, 2).s);
