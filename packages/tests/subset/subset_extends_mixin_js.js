// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Classes -- a computed base (`mixin(C)`) is a value, not a declaration: no layout
// exists to ground the subclass in, so a true mixin stays not-yet under the heritage message
// (plan.md §8 step 43). An alias or member base that names one class declaration compiles.

class C {
  constructor() {
    this.x = 1;
  }
}
function mixin(Base) {
  return Base;
}
class D extends mixin(C) {
  constructor() {
    super();
    this.y = 2;
  }
}
console.log(new D().x);
