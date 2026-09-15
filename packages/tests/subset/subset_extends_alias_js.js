// @mode: js
// @verdict: static
// SUBSET.md: Classes -- `extends K` where `const K = C` grounds to the target's layout
// (plan.md §8 step 43): the alias binds no value, so the subclass compiles exactly as if it
// named `C` -- descriptor, inherited members, vtable, super-call and instanceof alike.

class C {
  constructor() {
    this.x = 1;
  }
  m() {
    return this.x + 1;
  }
}
const K = C;

class D extends K {
  constructor() {
    super();
    this.y = 2;
  }
}

const d = new D();
console.log(d.m());
console.log(d instanceof D);
console.log(d instanceof C);
