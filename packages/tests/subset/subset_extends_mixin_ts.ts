// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Classes -- a computed base (`mixin(C)`) is a value, not a declaration: no layout
// exists to ground the subclass in, so a true mixin stays not-yet under the heritage message
// (plan.md §8 step 43). An alias or member base that names one class declaration compiles.

class C {
  x: number = 1;
}
function mixin(Base: new () => C): new () => C {
  return Base;
}
class D extends mixin(C) {
  y: number = 2;
}
console.log(new D().x);
