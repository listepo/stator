// @mode: js
// @verdict: dynamic
// SUBSET.md: Classes -- a class alias (`const K = C`) binds no value; every in-place use
// erases to the target declaration (plan.md §8 step 12e), so `new K`, `K.static` and
// `o instanceof K` compile exactly as the direct spelling.

class C {
  static s = 5;
  constructor(x) {
    this.x = x;
  }
  m() {
    return this.x + 1;
  }
  static sm() {
    return C.s + 1;
  }
}
const K = C;

const o = new K(1);
console.log(o.x);
console.log(o.m());
console.log(o instanceof K);
console.log(K.s);
console.log(K.sm());
K.s = 7;
console.log(K.s);
