// An inferred override that narrows the return type: the derived call answers the
// derived value, the base call answers the base value, and untyped and JSDoc-typed
// receivers dispatch to the right entry (plan.md §8 step 12(d), plan-notes 274).
class A {
  m() {
    return 'x';
  }
}
class B extends A {
  m() {
    return 1;
  }
}
/** @param {A} a */
function getm(a) {
  return a.m();
}
function callM(o) {
  return o.m();
}
console.log(new B().m());
console.log(new A().m());
console.log(callM(new B()));
console.log(callM(new A()));
console.log(getm(new B()));
console.log(getm(new A()));
