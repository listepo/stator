// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: rest parameters (call-side spread needs a dynamic argv)
class C {
  m(a, b) {
    return a + b;
  }
}
const c = new C();
const arr = [1, 2];
console.log(c.m(...arr));
class D {
  constructor(a, b) {
    console.log(a + b);
  }
}
const d = new D(...arr);
console.log(d instanceof D);
